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
  env : process.env.KRM_ENV || 'not-set',

  graph,

  cron : {
    fsExpire : '0 0-23 * * *'
  },

  controller : {
    // WARNING: this will store all outgoing messages in MongoDB so they can be queried
    debug : process.env.DEBUG_CONTROLLER === 'true' ? true : false
  },

  fs : {
    workerRoot : process.env.WORKER_FS_ROOT || '/storage/worker',
    nfsRoot : process.env.NFS_ROOT || '/storage/nfs',
    expire : 24 * 60 * 60
  },

  task : {
    defaultWorker : 'default.casita.library.ucdavis.edu'
  },

  api : {
    services : (process.env.API_SERVICES || '')
      .trim()
      .split(' ')
      .map(service => {
        service = service.trim().split(':');
        if( service.length === 1 ) {
          return {hostname: service[0], route: service[0]}
        }
        return {hostname: service[0], route: service[1]}
      })
  },

  // resources
  // https://docs.confluent.io/4.1.0/clients/librdkafka/INTRODUCTION_8md.html
  // https://kafka.apache.org/08/documentation.html
  // https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
  kafka : {
    host : env.KAFKA_HOST || 'kafka',
    port : env.KAFKA_PORT || 9092,
    partitionsPerTopic : 10,
    topics : {
      subjectReady : 'subject-ready',
      taskReady : 'task-ready'
    }
  },

  google : {
    projectId : env.GOOGLE_PROJECT_ID || 'digital-ucdavis-edu',
    serviceAccountFile : env.GOOGLE_SERVICE_ACCOUNT || '/etc/google/service-account.json'
  },

  logging : {
    name : env.LOG_NAME || 'krm-logging',
    level : env.LOG_LEVEL || 'info'
  },

  mongo : {
    dbName : 'krm',
    collections : {
      krmState : 'state',
      krmDebug : 'debug'
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
    debug : env.DEBUG_WORKER === 'true' ? true : false,
    maxRetries : 3
  }
}