const GraphParser = require('./graph-parser');
const uuid = require('uuid');
const {config, logger, bus, state} = require('@ucd-lib/krm-node-utils');

const kafka = bus.kafka;
const mongo = state.mongo;
// const ObjectId = mongo.ObjectId;

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

    setInterval(() => this.checkDelayWindow(), 1000);
  }

  async checkDelayWindow() {
    let collection = await mongo.getCollection(config.mongo.collections.krmState);
    let now = Date.now()

    const cursor = collection.find({
      $or : [
        {'data.lastUpdated' : {$le : now - (5 * 60 * 1000)}},
        {'data.readyTime' : {$le : now}}
      ]
    });

    let document;
    while ((document = await cursor.next())) {
      await this.sendTask(document);
    }
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

    try {
      logger.info(`handling kafka ${config.kafka.topics.subjectReady} message: ${kafka.utils.getMsgId(msg)}`);
      msg = JSON.parse(msg.value.toString('utf-8'));
      
      await this._onSubjectReady(msg.subject, msg.fromMessage);
    } catch(e) {
      logger.info(`failed to handle ${config.kafka.topics.subjectReady} kafka message`, msg, e);
    }
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

        if( task.definition.options.delay ) {
          await collection.updateOne({id: taskMsg.id}, {
            $set : {
              readyTime :  Date.now()+task.definition.options.delay,
            }
          });
          return;
        }

        await this.sendTask(taskMsg);
      }
    }
  }

  async sendTask(taskMsg) {
    await collection.deleteOne({id: taskMsg.id});

    // handle functional commands
    taskMsg.data.command = this.dependencyGraph.graph[taskMsg.data.subjectId].options.command;
    if( typeof taskMsg.data.command === 'function' ) {
      taskMsg.data.command = taskMsg.data.command(
        taskMsg, {
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

    let uid = uuid.v4();
    let id = isMultiDependency ? task.product : uid;
    let taskMsg = {
      id : uid,
      time : new Date().toISOString(),
      type : task.definition.worker || config.task.defaultWorker,
      source : 'http://controller.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : task.product,
      data : {
        name : task.definition.name,
        required : [],
        ready : [],
        subjectId : task.definition.id,
        args : task.args
      }
    }

    let resp;
    try {
      // we have to do this in two steps :(
      // we don't know if the document exists, so we have to use this
      // update/$setOnInsert command to only insert if it doesn't exist
      // however, this throws an error if we try to add the 
      // $addToSet command as well. so we do that as a second call, lame.
      // We return the new doc in both cases for proper error logging if
      // things fail.
      resp = await collection.findOneAndUpdate(
        { _id : id },
        { $setOnInsert: taskMsg},
        { 
          returnOriginal: false,
          upsert: true
        }
      );

      resp = await collection.findOneAndUpdate(
        { _id : id },
        { $addToSet : {'data.required': task.subject} },
        { returnOriginal: false }
      );

      if( resp.value ) {
        return resp.value;
      }

      throw new Error('Mongo upsert failed');
    } catch(e) {
      logger.error(
        'Failed to insert new task into mongo', {
          subject: task.product, 
          required:task.subject,
          mongoResponse: resp
        }, 
        e
      );
    }

    return taskMsg;
  }

  _getDependentCount(subject, opts) {
    if( typeof opts.dependentCount === 'function' ) {
      return parseInt(opts.dependentCount(subject, config.fs.nfsRoot));
    }
    return parseInt(opts.dependentCount || 1);
  }

}

module.exports = KrmController;