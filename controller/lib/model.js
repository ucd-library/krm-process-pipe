const uuid = require('uuid');
const {config, Monitor, GraphParser, logger, bus, state} = require('@ucd-lib/krm-node-utils');

const kafka = bus.kafka;
const mongo = state.mongo;

/**
 * @class KrmController
 * @description Both a source and a sink for kafka events.  Listens to the
 * config.kafka.topics.subjectReady topic.  For each message: 
 *  - Looks up message subject in dependency graph
 *  - Creates a new task for each dependency or adds subject to task if task already exists
 *  - Checks if task has all subjects required to execute
 *  - Places task message on proper task topic if ready to execute
 */
class KrmController {

  constructor(opts={}) {
    this.id = uuid.v4();
    this.groupId = 'controller';

    // create the kafka producer
    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });

    // create the consumer, always start from last committed offset (earliest)
    this.kafkaConsumer = new kafka.Consumer({
      'group.id': this.groupId,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': false,
      'auto.offset.reset' : 'earliest'
    })

    // set the raw graph and the parsed dependency graph object
    this.graph = opts.graph || config.graph;
    this.dependencyGraph = new GraphParser(this.graph);

    // for cloud monitoring 
    // JM - seems like these should be CUMULATIVE, but this says we can't
    // monitor them... doesn't help much: https://cloud.google.com/monitoring/api/v3/kinds-and-types
    this.monitor = new Monitor('krm-controller-'+this.id);
    this.metrics = {
      tasks : {
        description: 'KRM tasks ready per second',
        displayName: 'Tasks Ready',
        type: 'custom.googleapis.com/krm/tasks_ready',
        metricKind: 'GAUGE',
        valueType: 'INT64',
        unit: '1',
        labels: [
          {
            key: 'env',
            valueType: 'STRING',
            description: 'KRM ENV',
          },
          {
            key: 'taskId',
            valueType: 'STRING',
            description: 'Task URI ID',
          },
          {
            key: 'serviceId',
            valueType: 'STRING',
            description: 'Service Instance',
          }
        ]
      },
      subjects : {
        description: 'KRM subjects ready per second',
        displayName: 'Subjects Ready',
        type: 'custom.googleapis.com/krm/subjects_ready',
        metricKind: 'GAUGE',
        valueType: 'INT64',
        unit: '1',
        labels: [
          {
            key: 'env',
            valueType: 'STRING',
            description: 'KRM ENV',
          },
          {
            key: 'source',
            valueType: 'STRING',
            description: 'Source of message',
          },
          {
            key: 'serviceId',
            valueType: 'STRING',
            description: 'Service Instance',
          }
        ]
      }
    }

    this.monitor.registerMetric(
      this.metrics.tasks,
      {
        // beforeWriteCallback: this.beforeMetricWrite,
        onReset : () => {
          let stats = {};
          for( let taskId in this.graph ) {
            stats[taskId] = {
              taskId,
              value : 0,
              time : new Date()
            }
          }
          return stats
        }
      }
    );
    this.monitor.registerMetric(
      this.metrics.subjects
      // {beforeWriteCallback: this.beforeMetricWrite}
    );
    this.monitor.ensureMetrics();
  }

  // beforeMetricWrite(item, info) {
  //   return item.value / (info.interval/1000);
  // }

  async connect() {
    // connect both producer and consummer
    await this.kafkaProducer.connect();
    await this.kafkaConsumer.connect();

    // ensure the subjectReady topic in kafka
    await kafka.utils.ensureTopic({
      topic : config.kafka.topics.subjectReady,
      num_partitions: config.kafka.partitionsPerTopic || 1,
      replication_factor: 1,
    }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

    // create a kafka topic for ready tasks
    await kafka.utils.ensureTopic({
      topic:  config.kafka.topics.taskReady,
      num_partitions: config.kafka.partitionsPerTopic,
      replication_factor: 1
    }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

    await mongo.ensureIndexes();

    // subscribe to the subjectReady topic and start listening 
    await this.kafkaConsumer.subscribe([config.kafka.topics.subjectReady]);
    this.listen();

    // startup the delay window timer.  This delay window expires tasks that
    // are waiting for subjects which took to long to arrive.
    setInterval(async () => {
      try {
        await this.checkDelayWindow();
      } catch(e) {
        logger.error('Check delay error', e);
      }
    }, 5000);
  }

  /**
   * @method checkDelayWindow
   * @description distributed systems are chaos. Every task has a defined about of 
   * time it will wait for it's dependency subjects to come in.  This method checks
   * all pending tasks in mongo and checks to see if they delayReadyTime has expired.
   */
  async checkDelayWindow() {
    let collection = await mongo.getCollection(config.mongo.collections.krmState);
    let now = Date.now()

    const cursor = collection.find();

    let document;
    while ((document = await cursor.next())) {
      if( document.data.delayReadyTime && document.data.delayReadyTime < now ) {
        await this.sendTask(document);
        continue;
      }

      // TODO: recheck ready here as well

      let def = this.dependencyGraph.graph[document.data.taskDefId];

      if( !def ) {
        logger.warn(`Delay found task id ${document.data.taskDefId} with no definition, ignoring`);
        continue;
      }

      let timeout = (def.options || {}).timeout || (5 * 60 * 1000);
      if( document.data.lastUpdated < now - timeout ) {
        logger.warn('Sending task after expired timeout window', document);
        await this.sendTask(document, {
          reason : 'window timeout expired, (lastUpdated < now - timeout)',
          now, timeout
        });
      }
    }
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this._onMessage(msg));
    } catch(e) {
      logger.error('kafka consume error', e);
    }
  }

  /**
   * @method _onMessage
   * @description handle a kafka message.  Parsed kafka message, passed message to _onSubjectReady
   * 
   * @param {Object} msg kafka message
   */
  async _onMessage(msg) {
    this.run = false;

    try {
      logger.debug(`Handling kafka ${config.kafka.topics.subjectReady} message: ${kafka.utils.getMsgId(msg)}`);
      msg = JSON.parse(msg.value.toString('utf-8'));
      this.monitor.incrementMetric(this.metrics.subjects.type, 'source', {source: msg.source});

      await this._onSubjectReady(msg.subject, (msg.data || {}).task);
    } catch(e) {
      logger.info(`failed to handle ${config.kafka.topics.subjectReady} kafka message`, msg, e);
    }
  }

  /**
   * @method _onSubjectReady
   * @description Main method for checking a subject ready message against the dependency graph.
   * Generates new task or appends to existing tasks.  Checks if task dependencies are met and
   * sends message to proper task kafka queue
   * 
   * @param {String} subject subject uri
   * @param {Object} parentTask task info for subject
   */
  async _onSubjectReady(subject, parentTask={}) {
    // get all tasks that are dependent on this subject from the dependency graph
    let dependentTasks = this.dependencyGraph.match(subject) || [];
    // if no tasks returned, we are done here
    if( !dependentTasks.length ) return;

    logger.info('Handling subject with tasks: '+subject);

    let collection = await mongo.getCollection(config.mongo.collections.krmState);

    // loop all dependent tasks and check task dependency state
    for( let task of dependentTasks ) {

      // this method either generates a new task message or creates a new task message
      // if one does not exist.  Note this method will insert new task into mongo.
      let taskMsg = await this._generateTaskMsg(task);

      // the dependent tasks array is an array of ALL depended tasks.
      // Even children of children.  We only want to add subjects of 
      // direct children to the 'ready' array. And preform the additional
      // action of see if it's time to send.  Otherwise, we just want
      // to generate task message above (this adds subject to required array)
      if( task.subject !== subject ) continue;

      // ensure the subject is only added once to the data ready array
      // update the lastUpdate timestamp
      if( !taskMsg.data.ready.includes(subject) ) {
        taskMsg.data.lastUpdated = Date.now();
        taskMsg.data.ready.push(subject);
        let addToSet = {
          'data.ready' : subject
        };

        if( parentTask.id ) {
          taskMsg.data.parentTaskIds.push(parentTask.id);
          addToSet['data.parentTaskIds'] = parentTask.id;
        }

        // update mongo as well
        if( taskMsg.data.isMultiDependency ) {
          await collection.updateOne({id: taskMsg.id}, {
            $set : {
              'data.lastUpdated' : taskMsg.data.lastUpdated,
            },
            $addToSet : {
              'data.ready' : subject
            }
          });
        }
      }


      // now check to see if the task can execute multi-dependency task
      if( taskMsg.data.isMultiDependency ) {
        taskMsg = await collection.findOne({id: taskMsg.id});
        if( !taskMsg ) continue; // this task might have been handled by another worker
        if( taskMsg.data.dependenciesReady ) continue; // this task has already been handled

        // check to see if dependencies are ready given task message and task definition
        let ready = await this._ready(subject, task.definition.options, taskMsg);
        if( !ready ) continue; // we are done here;

        // update the delay ready time,  this is the time when the task expires
        // UPDATE JM: I don't like this.  I think complex ready functions is the way to go.
        // if( task.definition.options.delay && !taskMsg.data.readyTime ) {
        //   await collection.updateOne({id: taskMsg.id}, {
        //     $set : {
        //       'data.delayReadyTime' :  Date.now()+task.definition.options.delay,
        //     }
        //   });
        //   continue;
        // }
      }

      // set the dependenciesReady time
      taskMsg.data.dependenciesReady = Date.now();
      if( taskMsg.data.isMultiDependency ) {
        await collection.updateOne({id: taskMsg.id}, {
          $set : {
            'data.dependenciesReady' : taskMsg.data.dependenciesReady,
          }
        });
      }

      // fire off task message to kafka queue
      await this.sendTask(taskMsg);
    }
  }

  /**
   * @method sendTask
   * @description send a task message to proper task kafka queue.
   * 
   * @param {Object} taskMsg 
   * @param {Object} controllerMessage Additional not for this controller class 
   */
  async sendTask(taskMsg, controllerMessage) {
    if( taskMsg.data.isMultiDependency ) {
      // make sure we delete the message from mongo
      let collection = await mongo.getCollection(config.mongo.collections.krmState);
      let resp = await collection.deleteOne({id: taskMsg.id});

      // if no message was deleted, this message was already handled
      if( resp.result.n != 1 ) {
        logger.warn('Controller did not find message during delete, ignorning', taskMsg, resp);
        return;
      }
    }

    // handle functional commands
    taskMsg.data.command = this.dependencyGraph.graph[taskMsg.data.taskDefId].command;
    if( typeof taskMsg.data.command === 'function' ) {
      taskMsg.data.command = taskMsg.data.command(
        new URL(taskMsg.subject),
        taskMsg,
        config
      );
    }

    if( controllerMessage ) {
      taskMsg.data.controllerMessage = controllerMessage;
    }

    // if the debug flag is set, store all messages in debug collection
    if( config.controller.debug ) {
      let dc = await mongo.getCollection(config.mongo.collections.krmDebug);
      let copy = Object.assign({}, taskMsg);
      delete copy._id;
      await dc.insert(copy);
    }

    // stringify task data
    // let topicName = kafka.utils.getTopicName(taskMsg.data.taskDefId);
    // This makes it a pain for tools like ksqlDB...
    // taskMsg.data = JSON.stringify(taskMsg.data);

    logger.info('Sending task message to '+config.kafka.topics.taskReady+' topic for subject: '+taskMsg.subject);
    this.kafkaProducer.produce({
      topic : config.kafka.topics.taskReady,
      value: taskMsg,
      key : this.groupId
    });

    this.monitor.incrementMetric(this.metrics.tasks.type, 'taskId', {taskId: taskMsg.data.taskDefId});
  }

  /**
   * @method _generateTaskMsg
   * @description either fetch and return existing task message or create a new message
   * 
   * @param {Object} task dependency graph task object 
   */
  async _generateTaskMsg(task) {
    let collection = await mongo.getCollection(config.mongo.collections.krmState);
    let isMultiDependency = task.definition.options.dependentCount ? true : false;

    // check to see if task already exits
    let existingTasks = await collection.find({subject: task.product}).toArray();
    // let existingTasks = this.state.getBySubject(task.product);
    
    if( existingTasks.length ) {
      // this is bad, more than one task was generated
      if( isMultiDependency && existingTasks.length > 1 ) {
        logger.error('More that one mongo task object for multi-dependency-task. subject: '+task.subject, existingTasks.map(t => t.id))
      }

      let existingTask = null;
      if( isMultiDependency ) { // if badness, just graph first
        existingTask = existingTasks[0];
      } else {
        // if multi tasks are acting on the same subject, loop through and find the task
        // that has the provided subject as a dependency
        for( let et of existingTasks ) {
          if( et.data.required.includes(task.subject) ) {
            existingTask = et;
            break;
          }
        }

        // unable to find an existing task, create and return new task message
        if( !existingTask ) {
          return this.createTask(task);
        }
      }

      // add new subject as dependency of the task
      if( !existingTask.data.required.includes(task.subject) ) {
        existingTask.data.required.push(task.subject);
      }
      await collection.updateOne({id: existingTask.id}, {
        $addToSet : {
          'data.required' : task.subject
        }
      });

      // return our existing task
      return existingTask;
    }

    // no tasks found for subject, create new task and return
    return this.createTask(task);
  }

  /**
   * @method createTask
   * @description given a dependency graph task definition, create a new task
   * message and store in mongo
   * 
   * @param {Object} task dependency graph task definition object
   */
  async createTask(task) {
    let isMultiDependency = false;

    // we have to assume any task definition with a ready function can have multiple dependencies
    if( task.definition.options.ready ) {
      isMultiDependency = true;
    } else if( task.definition.options.dependentCount && task.definition.options.dependentCount > 1 ) {
      isMultiDependency = true;
    }

    let collection = await mongo.getCollection(config.mongo.collections.krmState);

    // complicated id setup here.
    // any one-to-one (one single subject creates a task) we use a guid as uid
    // otherwise we use product id.  The product id ensures we don't get multiple
    // task messages for same subject in mongo
    let uid = uuid.v4();
    let id = isMultiDependency ? task.product : uid;

    let taskMsg = {
      id : uid,
      time : new Date(),
      type : task.definition.worker || config.task.defaultWorker,
      source : 'http://controller.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : task.product,
      data : {
        isMultiDependency,
        name : task.definition.name,
        required : [],
        ready : [],
        parentTaskIds : [],
        taskDefId : task.definition.id,
        args : task.args
      }
    }

    if( !isMultiDependency ) {
      return taskMsg;
    }

    let resp;
    try {
      // we have to do this in two steps :(
      // we don't know if the document exists (distributed system and all...), 
      // so we have to use this update/$setOnInsert command to only insert if 
      // it doesn't exist however, this throws an error if we try to add the 
      // $addToSet command as well (for required data). so we do that as a second call, lame.
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
        { _id : id  },
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

  /**
   * @method _ready
   * @description check if a task message is ready to execute
   * 
   * @param {*} subject 
   * @param {*} opts 
   * @param {*} msg 
   */
  _ready(subject, opts, msg) {
    // if the dependency graph task definition has ready function, call 
    // with the parsed subject uri, task message in it's current state
    // and the application config
    if( opts.ready ) {
      return opts.ready(new URL(subject), msg, config);
    }

    // otherwise just check the ready array is equal to the defined dependentCount (defaults to 1)
    let dependentCount = parseInt(opts.dependentCount || 1);
    return (dependentCount <= msg.data.ready.length);
  }

}

module.exports = KrmController;