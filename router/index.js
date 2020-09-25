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
      'enable.auto.commit': false,
      'auto.offset.reset' : 'earliest'
    });
    await this.kafkaConsumer.connect();

    let allTopics = {};
    for( let subjectId in config.graph.graph ) {
      allTopics[kafka.utils.getTopicName(subjectId)] = true;
      if( !config.graph.graph[subjectId].dependencies ) continue;
      for( let dep of config.graph.graph[subjectId].dependencies ) {
        allTopics[kafka.utils.getTopicName(dep.subject)] = true; 
      }
    }

    for( let topicName of Object.keys(allTopics) ) {
      await kafka.utils.ensureTopic({
        topic: topicName,
        num_partitions: config.kafka.partitionsPerTopic,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});
    }

    await this.kafkaConsumer.subscribe(Object.keys(allTopics));
    await this.listen();
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

    logger.info(`Routing message for ${msg.subject} to ${msg.type} queue`);
    await this.queue.send(msg.type, msg);
  }

}

new Router();