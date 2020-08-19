const Kafka = require('node-rdkafka');

class Producer {

  constructor(config) {
    this.config = config;
    this.client = new Kafka.Producer(config);
  }

  /**
   * @method connect
   * @description connect client
   * 
   * @param {Object} opts 
   */
  connect(opts={}) {
    return new Promise((resolve, reject) => {
      this.client.connect(opts, (err, data) => {
        if( err ) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * @method disconnect
   * @description disconnect client
   * 
   * @param {Object} opts 
   */
  disconnect() {
    return new Promise((resolve, reject) => {
      this.client.disconnect((err, data) => {
        if( err ) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * @method produce
   * @description send message.  If message value is object it will be automatically turned
   * into JSON string.  If value is string, it will be automatically turned into Buffer.
   * Sets message timestamp to Date.now()
   * 
   * @param {Object} msg
   * @param {Object|String|Buffer} msg.value message payload
   * @param {String} msg.topic topic to send message to
   * @param {String} msg.key additional key for message
   */
  produce(msg) {
    if( typeof msg.value === 'object' && !(msg.value instanceof Buffer)) {
      msg.value = JSON.stringify(msg.value);
    }
    if( typeof msg.value === 'string' ) {
      msg.value = Buffer.from(msg.value);
    }

    this.client.produce(msg.topic, null, msg.value, msg.key, Date.now());
  }

}

module.exports = Producer;