const Kafka = require('node-rdkafka');

/**
 * Basica admin utilities for kafka
 */
class Admin {

  constructor(config) {
    this.client = Kafka.AdminClient.create(config);
  }

  /**
   * @method createTopic
   * @description this attempts to create a topic and ignores error message
   * if topic is already created
   * 
   * @param {Object} opts createTopic options (see kafka lib)
   */
  createTopic(opts) {
    return new Promise((resolve, reject) => {
      this.client.createTopic(opts, err => {
        if( err ) reject(err);
        else resolve();
      });
    });
  }

  disconnect() {
    this.client.disconnect();
  }

}

module.exports = Admin;