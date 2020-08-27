const config = require('./config');
const logger = require('./logger');
const uuid = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const kafka = require('./bus/kafka');

/**
 * Helper utility for adding subject to pipe
 */
class StartSubjectModel {

  constructor(opts={}) {
    this.groupId = opts.groupId || 'start-subject-model';

    if( opts.kafkaProducer ) {
      this.kafkaProducer = kafkaProducer;
    } else {
      this.kafkaProducer = new kafka.Producer({
        'metadata.broker.list': config.kafka.host+':'+config.kafka.port
      });
    }
  }

  async connect() {
    await this.kafkaProducer.connect();
  }

  async send(file, data) {
    let subject = 'file://'+path.join('/', file);

    let baseDir = path.parse(path.join(config.fs.nfsRoot, file)).dir;
    await fs.mkdirp(baseDir);
    await fs.writeFile(path.join(config.fs.nfsRoot, file), data);

    let value = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : 'new.subject',
      source : 'http://'+this.groupId+'.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject
    }
  
    logger.info(this.groupId+' sending subject ready to kafka: ', subject)
  
    await this.kafkaProducer.produce({
      topic : config.kafka.topics.subjectReady,
      value,
      key : this.groupId
    });
  }

}

module.exports = StartSubjectModel;