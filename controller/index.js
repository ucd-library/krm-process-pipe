const GraphParser = require('./lib/graph-parser');
const uuid = require('uuid');
const config = require('../utils/lib/config');

class KrmController {

  constructor(graph, opts={}) {
    if( opts.backend === 'distributed' ) {
      this.bus = require('../utils/lib/bus/kafka');
      this.state = require('../utils/lib/state/mongo');
    } else  {
      this.bus = require('../utils/lib/bus/memory');
      this.state = require('../utils/lib/state/memory');
    }

    this.bus.on('completed', msg => console.log(msg));

    this.dependencyGraph = new GraphParser(graph);
  }

  add(subject) {
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
      if( !task.definition.options.dependentCount || 
        task.definition.options.dependentCount === taskMsg.data.ready.length ) {
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

        this.bus.emit('task', taskMsg);
      }
    }
  }

  _generateTaskMsg(task) {
    let existingTask = this.state.getBySubject(task.subject);
    
    if( existingTask && task.definition.options.run !== 'everytime' ) {
      if( !existingTask.data.required.includes(task.subject) ) {
        existingTask.data.required.push(task.subject);
      }
      return existingTask;
    }

    // Note: command will be set right before
    // message is set
    task = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : task.type || config.task.defaultType,
      source : 'http://controller.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : task.subject,
      data : {
        name : task.definition.name,
        required : [task.subject],
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