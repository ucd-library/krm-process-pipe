const fs = require('fs-extra');
const path = require('path');
const {URL} = require('url');

const ROOT_FS = path.resolve(__dirname, '..', '..', 'storage');
const SERVER_URL = process.env.SERVER_URL || 'http://casita.library.ucdavis.edu';

let graph = null;
if( fs.existsSync(process.env.GRAPH_FILE || '/etc/krm/graph.js') ) {
  graph = require(process.env.GRAPH_FILE || '/etc/krm/graph.js');
}


module.exports = {
  graph,

  fs : {
    root : ROOT_FS,
    workerRoot : path.join(ROOT_FS, 'workers'),
    nfsRoot : path.join(ROOT_FS, 'nfs')
  },

  task : {
    defaultWorker : 'default.casita.library.ucdavis.edu'
  },

  mongo : {
    dbName : 'krm',
    collections : {
      dgState : 'dg-state'
    },
    host : env.MONGO_HOST || 'mongo',
    port : env.MONGO_PORT || 27017,
  },

  server : {
    url : new URL(SERVER_URL)
  },

  rabbitMq : {
    host : env.RABBITMQ_HOST || 'rabbitmq',
    port : env.RABBITMQ_PORT || 5672,
    defaultPriority : 5,
  }
}