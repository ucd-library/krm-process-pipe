const {bus, queue, config, logger} = require('@ucd-lib/krm-node-utils');
const exec = require('./lib/exec');
const fs = require('fs-extra');
const path = require('path');
const uuid = require('uuid');
const RabbitMQ = queue.rabbitmq;
const kafka = bus.kafka;

class Worker {

  constructor() {
    if( !config.worker.queue ) {
      throw new Error('No queue set for worker');
    }

    this.queue = new RabbitMQ();
    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });
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
      logger.info('Worker running msg', msgData.subject);

      // TODO, does this work?
      await this.run(msgData);

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

  async run(msg) {
    let uri = new URL(msg.subject);
    let cwd = process.cwd();

    if( uri.protocol === 'file:' ) {
      cwd = path.join(config.fs.nfsRoot, path.parse(uri.pathname).dir);
      await fs.mkdirp(cwd);

      let fullSubjectPath = path.join(config.fs.nfsRoot, uri.pathname);
      let exists = fs.existsSync(fullSubjectPath);

      if( exists ) {
        logger.info('Subject file already exists: '+uri.pathname);
      }

      msg.data.command = msg.data.command.replace(/{{ROOT}}/, config.fs.nfsRoot);
    }

    let {stdout, stderr} = await exec(msg.data.command, {cwd});

    if( config.worker.debug ) {
      logger.info({command: msg.data.command, stdout, stderr, cwd});
    }

    this.sendResponse(msg, {
      state : 'completed',
      command: msg.data.command,
      cwd,
      stdout, 
      stderr
    });
  }

  sendResponse(msg, response={}) {
    response.task = {
      id : msg.id,
      subject : msg.subject,
      subjectId : (msg.data || {}).subjectId
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

(async function() {
  let worker = new Worker();
  worker.connect();
})();