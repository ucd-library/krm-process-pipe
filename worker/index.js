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
    await this.queue.listen(config.worker.queue, msg => this.onMessage(msg));

    await this.kafkaProducer.connect();
  }

  async onMessage(queueMsg) {
    let msgData = null;

    try {
      msgData = JSON.parse(queueMsg.content.toString());
      msgData.data = JSON.parse(msgData.data);
      logger.info('Worker running msg', msgData.subject);

      // TODO, does this work?
      await this.run(msgData);

      await this.queue.ack(queueMsg);
    } catch(e) {
      logger.error('Worker failed to run msg', e, queueMsg);

      if( !msgData ) {
        logger.error('Worker got a really bad message', queueMsg.content.toString());
        this.sendResponse(msgData, {
          state: 'failed',
          failures: [{message: queueMsg.content.toString()}]
        });
        await this.queue.ack(queueMsg);
      }
      
      if( !msgData.data.failures ) msgData.data.failures = [];
      msgData.data.failures.push({
        message : e.message,
        stack : e.stack,
        cmd : e.cmd,
        code : e.code,
        stdout : e.stdout,
        stderr : e.stderr
      });

      msgData.data = JSON.stringify(msgData.data);
      msgData.content = Buffer.from(JSON.stringify(msgData));

      if( msgData.data.failures.length < config.worker.maxRetries ) {
        await this.queue.nack(queueMsg);
        return;
      }

      this.sendResponse(msgData, {
        state: 'failed',
        failures: msgData.failures
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

      // if( exists && !msg.data.force ) {
      //   // logger.warn('Ignoring task, subject file already exists: '+uri.pathname);
      //   // this.sendResponse(msg, {
      //   //   state : 'ignored',
      //   //   details : 'Subject file already exists'
      //   // });
      //   // return;

      // } else 
      if( exists ) {
        logger.info('Subject file already exists: '+uri.pathname);
      }

      msg.data.command = msg.data.command.replace(/{{ROOT}}/, config.fs.nfsRoot);
    }

    let {stdout, stderr} = await exec(msg.data.command, {cwd});

    this.sendResponse(msg, {
      state : 'completed',
      stdout, 
      stderr
    });
  }

  sendResponse(msg, response={}) {
    response.fromMessage = msg;

    let finishedMsg = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : msg.type,
      source : 'http://worker.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : msg.subject,
      data : JSON.stringify(response)
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