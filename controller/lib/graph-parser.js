const {URL} = require('url');
const {utils} = require('@ucd-lib/krm-node-utils');

class GraphParser {

  constructor(graph) {
    if( typeof graph === 'string' ) {
      graph = require(graph);
    }
    this.name = graph.name;
    this.graph = graph.graph;

    for( let key in this.graph ) {
      this.graph[key].subject = utils.subjectParser(key);
      this.graph[key].id = key;
      if( !this.graph[key].options ) {
        this.graph[key].options = {};
      }
      for( let depend of this.graph[key].dependencies ) {
        depend.subject = utils.subjectParser(depend.subject);
      }
    }
  }

  match(subjectHref, dependents=[]) {
    for( let key in this.graph ) {
      for( let depend of this.graph[key].dependencies ) {

        let match = subjectHref.match(depend.subject.path.regex);
        if( !match ) continue;
  
        let dependArgs = {};
        let args = {};
        let product = key;

        depend.subject.path.args.forEach((argname, i) => {
          dependArgs[argname] = match[i+1];
          product = product.replace(new RegExp(`{${argname}}`), dependArgs[argname]);
        });
        product = product.replace(/\/$/, '');

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
  
        let item = {
          subject : subjectHref,
          product,
          definition : this.graph[key],
          args
        };
        dependents.push(item);

        this.match(product, dependents);
      }
    }

    return dependents;
  }

}

module.exports = GraphParser;