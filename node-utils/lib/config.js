const fs = require('fs-extra');
const path = require('path');
const {URL} = require('url');
const { env } = require('process');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

let setup = {};
if( fs.existsSync(process.env.SETUP_FILE || '/etc/krm/setup') || fs.existsSync('/etc/krm/setup.js') ) {
  setup = require(process.env.SETUP_FILE || '/etc/krm/setup');
}

if( !setup.services ) setup.services = [];
if( process.env.API_SERVICES ) {
  process.env.API_SERVICES
    .trim()
    .split(' ')
    .forEach(service => {
      service = service.trim().split(':');
      if( service.length === 1 ) {
        setup.services.push({hostname: service[0], route: service[0]})
      }
      setup.services.push({hostname: service[0], route: service[1]})
    });
}

module.exports = {
  env : process.env.KRM_ENV || 'not-set',

  graph : setup.graph,
  eventShortcuts : setup.eventShortcuts,

  cron : {
    fsExpire : '0 0-23 * * *'
  },

  fs : {
    workerRoot : process.env.WORKER_FS_ROOT || '/storage/worker',
    nfsRoot : process.env.NFS_ROOT || '/storage/nfs',
    expire : 24 * 60 * 60
  },

  api : {
    services : setup.services
  },

  // resources
  // https://docs.confluent.io/4.1.0/clients/librdkafka/INTRODUCTION_8md.html
  // https://kafka.apache.org/08/documentation.html
  // https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
  kafka : {
    host : env.KAFKA_HOST || 'kafka',
    port : env.KAFKA_PORT || 9092,
    partitionsPerTopic : env.KAFKA_TOPIC_PARTITIONS || 10,
    topics : {
      execComplete : 'exec-complete',
      rabbitMqRoute
    }
  },

  google : {
    // TODO: if service account file set, override project id using values.
    projectId : env.GOOGLE_PROJECT_ID,
    serviceAccountFile : env.GOOGLE_SERVICE_ACCOUNT || '/etc/google/service-account.json'
  },

  logging : {
    name : env.LOG_NAME || 'krm-logging',
    level : env.LOG_LEVEL || 'info'
  },

  redis : {
    host : env.REDIS_HOST || 'redis',
    port : env.REDIS_PORT || 6379,
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
    topic : env.WORKER_TOPIC,
    queue : env.WORKER_QUEUE || env.WORKER_TYPE,
    debug : env.DEBUG_WORKER === 'true' ? true : false,
    maxRetries : 3
  }
}