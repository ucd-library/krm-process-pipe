const GraphParser = require('./lib/graph-parser');
const uuid = require('uuid');

class KrmController {

  constructor(graph, opts={}) {
    if( opts.backend === 'distributed' ) {
      this.bus = require('../utils/lib/bus/kafka');
      this.state = require('../utils/lib/state/mongo');
    } else  {
      this.bus = require('../utils/lib/bus/memory');
      this.state = require('../utils/lib/state/memory');
    }

    this.dependencyGraph = new GraphParser(graph);
  }

  add(subject) {
    let dependentTasks = this.dependencyGraph.match(subject);
    if( !dependentTasks ) return;

    for( let task of dependentTasks ) {
      let taskMsg = this._generateTaskMsg(task);

      // see if a required subject is ready
      debugger;
      if( taskMsg.data.required.includes(subject) ) {
        taskMsg.data.lastUpdated = Date.now();
        taskMsg.data.ready.push(subject);
      }

      // now check to see if the task can execute
      if( !task.definition.options.dependentCount || 
        task.definition.options.dependentCount === taskMsg.data.ready.length ) {
        taskMsg.data.dependenciesReady = true;

        this.state.remove(taskMsg.id);
        taskMsg.data = JSON.stringify(taskMsg.data);
        this.bus.emit('task', taskMsg);
      }
    }
  }

  _generateTaskMsg(task) {
    let existingTask = this.state.getBySubject(task.product);
    
    if( existingTask && task.definition.options.run !== 'everytime' ) {
      if( !existingTask.data.required.includes(task.subject) ) {
        existingTask.data.required.push(task.subject);
      }
      return existingTask;
    }

    task = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : 'casita.backend.task',
      source : 'http://controller.casita.library.ucdavis.edu',
      datacontenttype : 'application/json',
      subject : task.product,
      data : {
        name : task.definition.name,
        required : [task.subject],
        ready : [],
        productId : task.definition.id,
        command : task.definition.command,
        args : task.args
      }
    }

    if( typeof task.data.command === 'function' ) {
      task.data.command = {
        function : task.data.command.toString()
      }
    }

    this.state.set(task);

    return task;
  }

}

module.exports = KrmController;