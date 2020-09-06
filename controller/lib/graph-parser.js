const {URL} = require('url');
class GraphParser {

  constructor(graph) {
    if( typeof graph === 'string' ) {
      graph = require(graph);
    }
    this.name = graph.name;
    this.graph = graph.graph;

    for( let key in this.graph ) {
      this.graph[key].subject = this.parseSubject(key);
      this.graph[key].id = key;
      if( !this.graph[key].options ) {
        this.graph[key].options = {};
      }
      for( let depend of this.graph[key].dependencies ) {
        depend.subject = this.parseSubject(depend.subject);
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

  parseSubject(subject) {
    subject = new URL(subject);

    subject = {
      href: decodeURIComponent(subject.href),
      origin: subject.origin,
      protocol: subject.protocol,
      host: subject.host,
      hostname: subject.hostname,
      port: subject.port,
      pathname: decodeURIComponent(subject.pathname),
      search: subject.search,
      searchParams: subject.searchParams,
      hash: subject.hash,
      path : {
        args : [],
        parts : decodeURIComponent(subject.pathname).replace(/^\//, '').split('/')
      }
    }

    let regex = escapeRegExp(subject.href);
    let parts = subject.href.match(/{[a-zA-Z0-9_\\-]+}/g) || [];
    for( let part of parts ) {
      let argname = part.replace(/(^{|}$)/g, '');
      subject.path.args.push(argname);
      regex = regex.replace(part, '([A-Za-z0-9_\\-]+)');
    }

    subject.path.regex = new RegExp('^'+regex+'$');
    return subject;
  }

}

function escapeRegExp(text) {
  return text.replace(/[-[\]()*+?.,\\^$|#\s]/g, '\\$&');
}

module.exports = GraphParser;