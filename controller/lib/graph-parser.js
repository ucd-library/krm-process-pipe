const {utils} = require('@ucd-lib/krm-node-utils');

/**
 * @class GraphParser
 * @description parses the graph task definitions and provides method 
 * for matching subject uri's to tasks
 */
class GraphParser {

  /**
   * @description create a new graph parser with user provided dependency
   * graph definition
   * 
   * @param {Object|String} graph Dependency graph task definitions.  If string,
   * should be file location on disk.
   */
  constructor(graph) {
    // load from disk if string is passed
    if( typeof graph === 'string' ) {
      graph = require(graph);
    }
    this.graph = graph;

    for( let key in this.graph ) {
      // given a subject uri string, break out into various components
      // required to match subject uris
      this.graph[key].subject = utils.subjectParser(key);

      // a task id is the subject uri with variable names instead of values
      this.graph[key].id = key;

      // make sure we have at least empty options set
      if( !this.graph[key].options ) {
        this.graph[key].options = {};
      }

      // parse all dependency subject uri's for this task
      for( let depend of this.graph[key].dependencies ) {
        depend.subject = utils.subjectParser(depend.subject);
      }
    }
  }

  /**
   * @method match
   * @description recursively find all tasks that have a dependency on
   * this subject.  Create the task definition object for those tasks.
   * 
   * Task definition object:
   * {
   *   subject : String, subject uri that is a dependency of future tasks
   *   product : String, subject uri of task to complete (product)
   *   definition : Object, user defined task from graph definition
   *   args : Object, key/value pairs of subject task uri arguments and there specific values fot this task
   * }
   * 
   * @param {String} subjectHref subject uri
   * @param {Array} dependents result array of dependent tasks.  recursively passed
   * @param {Boolean} entireGraph by default we are only going to find direct child tasks.  Set
   * this flag if you wish to see ALL possible tasks spawn from a subject
   */
  match(subjectHref, dependents=[], entireGraph=false) {
    // for every task subject uri (key) defined in graph
    for( let key in this.graph ) {
      // loop through the tasks dependencies 
      for( let depend of this.graph[key].dependencies ) {

        // if the tasks dependency subject uri regex matches provided subject uri, continue on
        let match = subjectHref.match(depend.subject.path.regex);
        if( !match ) continue;
  
        let dependArgs = {};
        let args = {};
        let product = key;

        // set all argument variables in the tasks dependency subject uri
        // as well use update the task uri, filling in uri variables
        depend.subject.path.args.forEach((argname, i) => {
          dependArgs[argname] = match[i+1];
          product = product.replace(new RegExp(`{${argname}}`), dependArgs[argname]);
        });
        product = product.replace(/\/$/, '');

        // finally, set the required variables for this task
        this.graph[key].subject.path.args.forEach(argname => {
          args[argname] = dependArgs[argname]; 
        });

        // TODO: if a constraint arg is present and doesn't match, ignore!
        if( depend.constraints ) {
          match = true;
          for( let key in depend.constraints ) {
            if( !args[key].match(depend.constraints[key]) ) {
              match = false;
              break;
            }
          }
          if( !match ) continue;
        }
  
        // create task definition object
        let item = {
          subject : subjectHref,
          product,
          definition : this.graph[key],
          args
        };
        dependents.push(item);

        if( entireGraph ) {
          // no recursively loop through dependent tasks, so which tasks they generate 
          this.match(product, dependents);
        }
      }
    }

    return dependents;
  }

}

module.exports = GraphParser;