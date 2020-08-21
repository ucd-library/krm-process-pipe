const fs = require('fs-extra');
const path = require('path');
const {URL} = require('url');
const { env } = require('process');

// const ROOT_FS = path.resolve(__dirname, '..', '..', 'storage');
const SERVER_URL = process.env.SERVER_URL || 'http://casita.library.ucdavis.edu';

let graph = null;
if( fs.existsSync(process.env.GRAPH_FILE || '/etc/krm/graph') ) {
  graph = require(process.env.GRAPH_FILE || '/etc/krm/graph');
}

module.exports = {
  graph,

  fs : {
    workerRoot : process.env.WORKER_FS_ROOT || '/storage/worker',
    nfsRoot : process.env.NFS_ROOT || '/storage/nfs'
  },

  task : {
    defaultWorker : 'default.casita.library.ucdavis.edu'
  },

  kafka : {
    host : env.KAFKA_HOST || 'kafka',
    port : env.KAFKA_PORT || 9092,
    topics : {
      subjectReady : 'subject-ready'
    }
  },

  google : {
    serviceAccountFile : env.GOOGLE_SERVICE_ACCOUNT || '/etc/google/service-account.json'
  },

  logging : {
    name : env.LOG_NAME || 'krm-logging',
    level : env.LOG_LEVEL || 'info'
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
  },

  worker : {
    queue : env.WORKER_QUEUE || env.WORKER_TYPE,
    maxRetries : 3
  }
}