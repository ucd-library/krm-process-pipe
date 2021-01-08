const {config, GraphParser} = require('@ucd-lib/krm-node-utils');

class GraphUtils {

  constructor() {
    this.graph = config.graph;
    this.dependencyGraph = new GraphParser(this.graph);
  }

  getTaskGraph(subjectUri) {
    let taskId = this._getTaskId(subjectUri);
    if( !taskId ) return {};

    let taskGraph = this._getChildTaskGraph(subjectUri);
    this._getParentTasks(taskId, taskGraph);

    return {
      subjectUri, taskId,
      taskGraph
    };
  }

  _getChildTaskGraph(subjectUri, taskGraph={}) {
    let taskId = this._getTaskId(subjectUri);
    if( !taskId ) return;
    if( taskGraph[taskId] ) return taskGraph;

    taskGraph[taskId] = (this.dependencyGraph.match(subjectUri) || [])
      .map(item => {
        return {
          taskId : item.definition.subject.href,
          subjectUri : item.product
        }
      });

    for( let task of taskGraph[taskId] ) {
      this._getChildTaskGraph(task.subjectUri, taskGraph);
    }

    return taskGraph;
  }

  _getTaskId(subjectUri) {
    for( let key in this.dependencyGraph.graph ) {
      let match = subjectUri.match(this.dependencyGraph.graph[key].subject.path.regex);
      if( match ) return key;
    }
    return '';
  }

  _getParentTasks(taskId, taskGraph={}) {
    for( let key in this.dependencyGraph.graph ) {
      if( taskId !== this.dependencyGraph.graph[key].subject.href ) continue;

      // loop through the tasks dependencies 
      for( let depend of this.graph[key].dependencies ) {
        if( taskGraph[depend.subject.href] ) {
          console.log('here', depend.subject.href);
          continue;
        }

        taskGraph[depend.subject.href] = [{id: taskId}];
        this._getParentTasks(depend.subject.href, taskGraph);
        break;
      }
    }

    return taskGraph;
  }


}

module.exports = new GraphUtils();