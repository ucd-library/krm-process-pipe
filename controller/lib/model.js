const GraphParser = require('./graph-parser');
const uuid = require('uuid');
const {config, logger, bus, state} = require('@ucd-lib/krm-node-utils');

const kafka = bus.kafka;
const mongo = state.mongo;
const ObjectId = mongo.ObjectId;

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

    let allTopics = {};
    for( let subjectId in this.graph.graph ) {
      allTopics[kafka.utils.getTopicName(subjectId)] = true;
      if( !this.graph.graph[subjectId].dependencies ) continue;
      for( let dep of this.graph.graph[subjectId].dependencies ) {
        allTopics[kafka.utils.getTopicName(dep.subject.href)] = true; 
      }
    }

    for( let topic of Object.keys(allTopics) ) {
      await kafka.utils.ensureTopic({
        topic,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});
    }

    let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(config.kafka.topics.subjectReady);
    this.topics = await this.kafkaConsumer.committed(config.kafka.topics.subjectReady);
    logger.info(`Controller (group.id=${this.groupId}) kafka status=`, this.topics, 'watermarks=', watermarks);
  
    await this.kafkaConsumer.assign(this.topics);
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

    logger.info('Sending subject ready to kafka: ', subject)

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

  async _onSubjectReady(subject, fromMessage) {
    let dependentTasks = this.dependencyGraph.match(subject);
    if( !dependentTasks ) return;

    logger.info('Handling subject with tasks: '+subject);

    let collection = await mongo.getCollection(config.mongo.collections.krmState);

    for( let task of dependentTasks ) {
      let taskMsg = await this._generateTaskMsg(task);

      if( !taskMsg.data.ready.includes(subject) ) {
        taskMsg.data.lastUpdated = Date.now();
        taskMsg.data.ready.push(subject);
      }
      await collection.updateOne({id: taskMsg.id}, {
        $set : {
          lastUpdated : taskMsg.data.lastUpdated,
        },
        $addToSet : {
          'data.ready' : subject
        }
      });

      // now check to see if the task can execute
      let dependentCount = this._getDependentCount(task.subject, task.definition.options);
      let item = await collection.findOne({id: taskMsg.id}, {'data.ready': 1});

      if( item && dependentCount === item.data.ready.length ) {
        taskMsg.data.dependenciesReady = true;

        // this.state.remove(taskMsg.id);
        await collection.deleteOne({id: taskMsg.id});

        // handle functional commands
        taskMsg.data.command = task.definition.command;
        if( typeof taskMsg.data.command === 'function' ) {
          taskMsg.data.command = taskMsg.data.command(
            task, {
              fs : config.fs,
              uri : new URL(taskMsg.subject)
            }
          );
        }

        // stringify task data
        let topicName = kafka.utils.getTopicName(taskMsg.data.subjectId);
        taskMsg.data = JSON.stringify(taskMsg.data);

        logger.info('Sending task message to: '+topicName, 'subject='+taskMsg.subject);
        this.kafkaProducer.produce({
          topic : topicName,
          value: taskMsg,
          key : this.groupId
        });
      }
    }
  }

  async _generateTaskMsg(task) {
    let collection = await mongo.getCollection(config.mongo.collections.krmState);
    let isMultiDependency = task.definition.options.dependentCount ? true : false;

    let existingTasks = await collection.find({subject: task.product}).toArray();
    // let existingTasks = this.state.getBySubject(task.product);
    
    if( existingTasks.length ) {
      if( isMultiDependency && existingTasks.length > 1 ) {
        logger.error('More that one mongo task object for multi-dependency-task. subject: '+task.subject, existingTasks.map(t => t.id))
      }

      let existingTask = null;
      if( isMultiDependency ) {
        existingTask = existingTasks[0];
      } else {
        for( let et of existingTasks ) {
          if( et.data.required.includes(task.subject) ) {
            existingTask = et;
            break;
          }
        }

        if( !existingTask ) {
          return this.createTask(task);
        }
      }

      if( existingTask.data.required.includes(task.subject) ) {
        existingTask.data.required.push(task.subject);
      }
      await collection.updateOne({id: existingTask.id}, {
        $addToSet : {
          'data.required' : task.subject
        }
      });

      return existingTask;
    }

    return this.createTask(task);
  }

  async createTask(task) {
    let isMultiDependency = task.definition.options.dependentCount ? true : false;
    let collection = await mongo.getCollection(config.mongo.collections.krmState);

    try {
      let id = uuid.v4();
      task = {
        _id : isMultiDependency ? task.product : id,
        id : id,
        time : new Date().toISOString(),
        type : task.definition.worker || config.task.defaultWorker,
        source : 'http://controller.'+config.server.url.hostname,
        datacontenttype : 'application/json',
        subject : task.product,
        data : {
          name : task.definition.name,
          required : [task.subject],
          ready : [],
          subjectId : task.definition.id,
          args : task.args
        }
      }
      await collection.insertOne(task);
    } catch(e) {
      logger.warn('Failed to insert new task into mongo, attempting update: ', {subject: task.product, required:task.subject}, e);

      let resp;
      try {
        resp = await collection.findOneAndUpdate(
          { _id: ObjectId(task.product) },
          { $push : {required: task.subject} },
          { returnOriginal: false }
        );

        if( resp.value ) {
          return resp.value;
        }

        // last ditch attempt.  Really this means something bad happend.
        // probably an issue with the graph definition where the graphs dependent count
        // is not equal to the number of products matched
        await collection.insertOne(task);
      } catch(e) {
        logger.error('Failed to add required subject to task in mongo: ', {subject: task.product, required:task.subject, updateResponse: resp}, e);
      }
    }

    return task;
  }

  _getDependentCount(subject, opts) {
    if( typeof opts.dependentCount === 'function' ) {
      return parseInt(opts.dependentCount(subject, config.fs.nfsRoot));
    }
    return parseInt(opts.dependentCount || 1);
  }

}

module.exports = KrmController;