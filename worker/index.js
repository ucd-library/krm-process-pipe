const {bus, queue, config, logger} = require('@ucd-lib/krm-node-utils');
const exec = require('./lib/exec');
const { fs } = require('../node-utils/lib/config');
const RabbitMQ = queue.rabbitmq;

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

  connect() {
    logger.info('Worker connecting to queue: '+config.worker.queue);
    await this.queue.connect();
    await this.queue.createQueues(config.worker.queue);
    await this.queue.listen(config.worker.queue, msg => this.onMessage(msg));

    await this.kafkaProducer.connect();
  }

  async onMessage(queueMsg) {
    try {
      let msgData = JSON.parse(queueMsg.content.toString());
      msgData.data = JSON.parse(msgData.data);
      logger.info('Worker running msg', msgData);

      // TODO, does this work?
      await exec(msgData.data.cmd);

      await this.channel.ack(queueMsg);
    } catch(e) {
      logger.error('Worker failed to run msg', e, msg);
      
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
      msg.content = Buffer.from(JSON.stringify(msgData));

      if( msgData.failures.length < config.worker.maxRetries ) {
        await this.channel.nack(queueMsg);
        return;
      }

      this.sendResponse(msgData, {
        state: 'failed',
        failures: msgData.failures
      });
      await this.channel.ack(queueMsg);
    }
  }

  async run(msg) {
    let uri = new URL(msg.subject);
    if( uri.protocol === 'file:' ) {
      await fs.mkdirp(
        path.join(config.fs.nfsRoot, path.parse(uri.pathname).dir)
      );

      let fullSubjectPath = path.join(config.fs.nfsRoot, uri.pathname);
      let exists = fs.existsSync(fullSubjectPath);

      if( exists && !msg.data.force ) {
        logger.warn('Ignoring task, subject file already exists: '+uri.pathname, msg);
        this.sendResponse({
          state : 'ignored',
          details : 'Subject file already exists'
        });
        return;

      } else if( exists ) {
        logger.info('Subject file already exists but force flag set for: '+uri.pathname);
      }

      msg.data.command = msg.data.command.replace(/{{ROOT}}/, config.fs.nfsRoot);
    }

    let {stdout, stderr} = await exec(msg.data.command);

    this.sendResponse({
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

    return this.kafkaProducer.produce({
      topic : config.kafka.topics.subjectReady,
      value: finishedMsg,
      key : 'worker'
    });
  }

}

new Worker();