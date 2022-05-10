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

  /**
   * 
   * @param {Object} opts
   * @param {Object} opts.kafkaProducer Optional. kafka producer instance to use.  If not provided one will be create.
   * @param {String} opts.groupId groupId to use in message key.  defaults to 'start-subject-model'.  used in message source
   * @param {Boolean} opts.log log when event messages are sent
   */
  constructor(opts={}) {
    this.opts = opts;
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
    fs.writeFileSync(path.join(config.fs.nfsRoot, file), data);

    let value = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : 'new.subject',
      source : 'http://'+this.groupId+'.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject
    }
  
    if( this.opts.log === true ) {
      logger.info(this.groupId+' sending subject ready to kafka: ', subject)
    }

    await this.kafkaProducer.produce({
      topic : config.kafka.topics.subjectReady,
      value
    });
  }

}

module.exports = StartSubjectModel;