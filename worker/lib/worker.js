const {kafka, config, logger, redis} = require('@ucd-lib/krm-node-utils');
const exec = require('./exec');
const fs = require('fs-extra');
const path = require('path');
const uuid = require('uuid');
const os = require('os');

class Worker {

  constructor() {
    if( !config.worker.queue ) {
      

    this.id = uuid.v4();
    this.rootDir = path.join(os.tmpdir(), this.id);

    if( config.worker.queue === 'rabbitmq' ) {
      this.queue = new RabbitMQ();
    } else if ( config.worker.queue === 'consumer' ) {
      this.queue = new kafka.Consumer();
    } else {
      throw new Error('No queue set for worker');
    }

    
    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });
  }

  async initDir() {
    if( fs.existsSync(this.rootDir) ) {
      await fs.remove(this.rootDir);
    }
    await fs.mkdirp(this.rootDir);
  }

  async connect() {
    logger.info('Worker connecting to queue: '+config.worker.queue);
    await this.queue.connect();
    await this.queue.createQueues(config.worker.queue);

    await this.kafkaProducer.connect();

    await this.queue.listen(config.worker.queue, msg => this.onMessage(msg));
  }

  async onMessage(queueMsg) {
    let msgData = null;

    try {
      msgData = JSON.parse(queueMsg.content.toString());
      if( typeof msgData.data === 'string' ) {
        msgData.data = JSON.parse(msgData.data);
      }
      logger.debug('Worker running msg', msgData.id);

      // initialize work directory
      this.initDir();

      if( msg.readyCheck ) {
        let isActive = await redis.isGroupKeyActive(msg.groupByKey);
        if( !isActive ) return;

        let isReady = await this.run(msgData.readyCheck.exec, null, msgData);
        
        // run group by - ready check
        return;
      }

      let result;
      msgData.response = {};

      if( msgData.prepare ) {
        for( var key of msgData.prepare ) {
          let val = msgData.prepare[key];
          if( Array.isArray(val) ) val = val.join('');
          msgData.response[key] = this.renderDotPathTemplate(val, msgData);
        }
      }

      // run pre command
      if( msgData.preCmd ) {
        result = await this.run(msgData.preCmd.exec, msgData.preCmd.output, msgData);
        msgData.response = result.response;
      }

      // run main command
      result = await this.run(msgData.cmd.exec, msgData.cmd.output, msgData);
      msgData.response = Object.assign(msgData.response, result.response);

      // run post command
      if( msgData.postCmd ) {
        result = await this.run(msgData.postCmd.exec, msgData.cmd.output, msgData);
        msgData.response = Object.assign(msgData.response, result.response);
      }
      
      if( msgData.finalize ) {
        for( var key of msgData.finalize ) {
          let val = msgData.finalize[key];
          if( Array.isArray(val) ) val = val.join('');
          msgData.response[key] = this.renderDotPathTemplate(val, msgData);
        }
      }

      // clean work directory
      this.initDir();
     
      await this.queue.ack(queueMsg);
    } catch(e) {
      logger.warn('Worker failed to run msg', e, queueMsg);

      if( !msgData ) {
        logger.error('Worker got a really bad message', queueMsg.content.toString());
        this.sendResponse(msgData, {
          state: 'failed',
          failures: [{message: queueMsg.content.toString()}]
        });
        await this.queue.ack(queueMsg);
      }

      // msgData.content = Buffer.from(JSON.stringify(msgData));

      if( !msgData.data.failures ) msgData.data.failures = [];
      msgData.data.failures.push({
        message : e.message,
        stack : e.stack,
        cmd : e.cmd,
        code : e.code,
        stdout : e.stdout,
        stderr : e.stderr
      });

      if( msgData.data.failures.length < config.worker.maxRetries ) {
        logger.warn('Worker retry message, failures less than max retries ', msgData.data.failures.length, config.worker.maxRetries, msgData);
        // msgData.data = JSON.stringify(msgData.data);
        await this.queue.send(msgData.type, msgData);
        await this.queue.ack(queueMsg);
        return;
      }

      logger.error('Failed to run message '+config.worker.maxRetries+' times', JSON.stringify(msgData, '  ', '  '));
      this.sendResponse(msgData, {
        state: 'failed',
        failures: msgData.data.failures
      });
      await this.queue.ack(queueMsg);
    }
  }

  renderDotPathTemplate(tpl, msg) {
    let vars = tpl.match(/({{.*}})/g);
    for( let dotPathVar of vars ) {
      if( dotPathVar === '{{_script}}' ) continue;
      tpl.replace(dotPathVar, this.getMsgVar(dotPathVar, msg));
    }
    return tpl;
  }

  getMsgVar(dotPath, msg) {
    let parts = dotPath.replace(/^{{/, '').replace(/}}$/, '').split('.');
    let current = msg;
    let arrPart;

    for( let part of parts ) {
      if( current === undefined ) break;

      // check for array access
      arrPart = part.match(/\[(\d+)\]$/);
      if( arrPart ) {
        part = part.replace(/\[\d+\]$/, '');
        arrPart = parseInt(arrPart[1]);
        current = current[part];
        if( current !== undefined ) {
          current = current[arrPart];
        }
        continue;
      }

      if( Array.isArray(current) ) {
        current = current[0];
        if( current !== undefined ) {
          current = current[part];
        }
      } else {
        current = current[part];
      }      
    }

    if( typeof current !== 'string' ) {
      current = JSON.stringify(current);
    }

    return current;
  }

  async createMessageResponse(output, stdout) {
    // prepare response
    let response = {};

    if( output ) {
      let def;
      for( let key in output ) {
        def = output[key];

        if( def.from === 'stdout' ) {
          this.parseResponseVariable(key, def, stdout, response);
        } else if( def.from === 'file' ) {
          let filePath = path.normalize(this.rootDir, def.path);
          if( !fs.existsSync(filePath) ) {
            response[key] = {
              error : true,
              message : 'output path does not exist: '+filePath,
              key,
              output : def
            }
            return;
          }

          this.parseResponseVariable(key, def, await fs.readFile(filePath, 'utf-8'), response);

        } else {
          response[key] = {
            error : true,
            message : 'message output key has unknown "from" value: '+def.from,
            key,
            output : def
          }
        }
      }
    }

    return response;
  }

  async parseResponseVariable(key, def, value, response) {
    try {
      if( def.type == 'json') {
        response[key] = JSON.parse(value);
      } else {
        response[key] = value;
      }
    } catch(e) {
      response[key] = {
        error : true,
        message : e.message,
        value,
        output : def
      }
    }
  }

  async run(commandTpl, output, msg) {
    // prepare command
    let command = this.renderDotPathTemplate(commandTpl, msg);
    let script = '';

    // prepare script if provided
    if( msg.script ) {
      if( Array.isArray(msg.script) ) {
        msg.script = msg.script.join('');
      }
      script = this.renderDotPathTemplate(msg.script, msg);
      let scriptFile = path.join(this.rootDir, 'generic-script-'+uuid.v4());
      await fs.writeFile(scriptFile, script);
      
      if( command.match(/{{_script}}/) ) {
        command = command.replace(/{{_script}}/, scriptFile);
      } else {
        command += ' '+scriptFile;
      }
    }

    // exec command
    var stdout, stderr;
    try {
      var {stdout, stderr} = await exec(msg, {cwd: this.rootDir});
    } catch(e) {
      stderr = e.message;
    }

    let response = this.createMessageResponse(output, cmd);

    logger.debug({
      worker : this.id,
      script,
      response,
      command, stdout, stderr
    });

    return {
      scriptFile,
      script,
      command, 
      response,
      stdout, 
      stderr
    };
  }

  sendResponse(msg, response={}) {
    response.task = {
      id : msg.id,
      subject : msg.subject,
      taskDefId : (msg.data || {}).taskDefId
    }

    let finishedMsg = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : msg.type,
      source : 'http://worker.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : msg.subject,
      data : response
    }

    logger.info('Worker sending finished message: '+msg.subject, response.state);
    return this.kafkaProducer.produce({
      topic : config.kafka.topics.subjectReady,
      value: finishedMsg,
      key : 'worker'
    });
  }

}

module.exports = Worker;