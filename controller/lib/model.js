const GraphParser = require('./graph-parser');
const uuid = require('uuid');
const {config, logger, bus, state} = require('@ucd-lib/krm-node-utils');

const kafka = bus.kafka;
const mongo = state.mongo;

class KrmController {

  constructor(opts={}) {
    this.groupId = 'controller';

    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': this.groupId,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': true
    })

    this.graph = opts.graph || config.graph;
    this.dependencyGraph = new GraphParser(this.graph);
  }

  async connect() {
    await this.kafkaProducer.connect();
    await this.kafkaConsumer.connect();

    await kafka.utils.ensureTopic({
      topic : config.kafka.topics.subjectReady,
      num_partitions: 1,
      replication_factor: 1
    }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

    for( let subjectId in this.graph.graph ) {
      await kafka.utils.ensureTopic({
        topic : kafak.utils.getTopicName(subjectId),
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});
    }

    let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(config.kafka.topics.subjectReady);
    this.topics = await this.kafkaConsumer.committed(config.kafka.topics.subjectReady);
    logger.info(`Controller (group.id=${this.groupId}) kafak status=`, this.topics, 'watermarks=', watermarks);
  
    await this.kafkaConsumer.assign(config.kafka.topics.subjectReady);
    await this.listen();
  }

  sendSubjectReady(subject) {
    let value = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : 'new.subject',
      source : 'http://controller.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject
    }

    return this.kafkaProducer.produce({
      topic : config.kafka.topics.subjectReady,
      value,
      key : this.groupId
    });
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
    
    this._onSubjectReady(msg.subject, msg.fromMessage);
  }

  _onSubjectReady(subject, fromMessage) {
    let dependentTasks = this.dependencyGraph.match(subject);
    if( !dependentTasks ) return;

    for( let task of dependentTasks ) {
      let taskMsg = this._generateTaskMsg(task);

      // see if a required subject is ready
      if( taskMsg.data.required.includes(subject) ) {
        taskMsg.data.lastUpdated = Date.now();
        taskMsg.data.ready.push(subject);
      }

      // now check to see if the task can execute
      let dependentCount = task.definition.options.dependentCount || 1;
      if( dependentCount === taskMsg.data.ready.length ) {
        taskMsg.data.dependenciesReady = true;

        this.state.remove(taskMsg.id);

        // handle functional commands
        taskMsg.data.command = this.dependencyGraph.graph[taskMsg.data.subjectId].command;
        if( typeof taskMsg.data.command === 'function' ) {
          taskMsg.data.command = taskMsg.data.command(
            task, {
              fs : config.fs,
              uri : new URL(taskMsg.subject)
            }
          );
        }

        // stringify task data
        taskMsg.data = JSON.stringify(taskMsg.data);

        return this.kafkaProducer.produce({
          topic : kafka.utils.getTopicName(taskMsg.type),
          value: taskMsg,
          key : this.groupId
        });
      }
    }
  }

  _generateTaskMsg(task) {
    let existingTasks = this.state.getBySubject(task.product);
    
    if( existingTasks.length ) {
      for( let existingTask of existingTasks ) {
        let dependentCount = task.definition.options.dependentCount || 1;

        if( existingTask.data.required.length < dependentCount && 
          !existingTask.data.required.includes(task.subject) ) {
          
          existingTask.data.required.push(task.subject);
          return existingTask;
        } else if( existingTask.data.required.includes(task.subject) ) {
          return existingTask;
        }
      }
    }

    // Note: command will be set right before
    // message is set
    task = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : task.worker || config.task.defaultWorker,
      source : 'http://controller.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : task.product,
      data : {
        name : task.definition.name,
        required : [task.subject],
        requiredCount : task.definition.options.dependentCount || 1,
        ready : [],
        subjectId : task.definition.id,
        args : task.args
      }
    }

    this.state.set(task);

    return task;
  }

}

module.exports = KrmController;