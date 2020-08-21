const {bus, queue, config, logger} = require('@ucd-lib/krm-node-utils');
const kafka = bus.kafka;
const RabbitMQ = queue.rabbitmq;

class Router {

  constructor() {
    this.groupId = 'router';
    this.queue = new RabbitMQ();
    this.init();
  }

  async init() {
    // TODO: connect to rabbitmq first
    await this.queue.connect();
    let workerQueues = {};
    for( let subjectId in config.graph ) {
      taskTypes[config.graph[subjectId].worker || config.task.defaultWorker] = true;
    }
    await this.queue.createQueues(Object.keys(workerQueues));

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': this.groupId,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': true
    });
    await this.kafkaConsumer.connect();

    this.topics = [];
    for( let subjectId in config.graph ) {
      await kafka.utils.ensureTopic({
        topic : subjectId,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

      this.topics.push({topic: subjectId});
    }

    let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(this.topics);
    this.topics = await this.kafkaConsumer.committed(this.topics);
    logger.info(`Router (group.id=${this.groupId}) kafak status=`, topics, 'watermarks=', watermarks);


    await this.kafkaConsumer.assign(topics);
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      logger.error('kafka consume error', e);
    }
  }

  /**
   * @method onMessage
   * @description handle a kafka message.
   * 
   * @param {Object} msg kafka message
   */
  async onMessage(msg) {
    this.run = false;

    logger.info(`handling kafka message: ${kafka.utils.getMsgId(msg)}`);
    msg = JSON.parse(msg.value.toString('utf-8'));
    await this.queue.send(msg.type, msg);
  }

}

new Router();