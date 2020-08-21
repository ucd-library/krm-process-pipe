const {bus, queue, config, logger} = require('@ucd-lib/krm-node-utils');
const kafka = bus.kafka;
const RabbitMQ = queue.rabbitmq;

class Router {

  constructor() {
    this.groupId = 'router';
    this.queue = new RabbitMQ();
    this.connect();
  }

  async connect() {
    // TODO: connect to rabbitmq first
    await this.queue.connect();
    let workerQueues = {};
    for( let subjectId in config.graph.graph ) {
      workerQueues[config.graph.graph[subjectId].worker || config.task.defaultWorker] = true;
    }
    await this.queue.createQueues(Object.keys(workerQueues));

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': this.groupId,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': true
    });
    await this.kafkaConsumer.connect();

    let topics = [];
    for( let subjectId in config.graph.graph ) {
      let topicName = kafka.utils.getTopicName(subjectId);

      await kafka.utils.ensureTopic({
        topic : topicName,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

      let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(topicName);
      let topic = await this.kafkaConsumer.committed(topicName);
      topics.push(topicName);
      logger.info(`Router (group.id=${this.groupId}) kafak status=`, topic, 'watermarks=', watermarks);
    }

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