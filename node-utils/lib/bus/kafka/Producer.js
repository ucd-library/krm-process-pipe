const Kafka = require('node-rdkafka');
const logger = require('../../logger');
const waitUtil = require('../../wait-util');

class Producer {

  constructor(config) {
    this.config = config;
    this.client = new Kafka.Producer(config);

    this.client
      .on('ready', () => logger.info('Kafka producer ready'))
      .on('disconnected', e => logger.warn('Kafka producer disconnected', e))
      .on('event.error', e => {
        logger.error('Kafka producer event.error', e);
        setTimeout(() => {
          logger.error('Killing process due to error in kafka connection');
          process.exit(-1);
        }, 50);
      });
  }

  /**
   * @method connect
   * @description connect client
   * 
   * @param {Object} opts 
   */
  connect(opts={}) {
    return new Promise(async (resolve, reject) => {
      let [host, port] = this.config['metadata.broker.list'].split(':');
      await waitUtil(host, port);

      this.client.connect(opts, (err, data) => {
        this.client.setPollInterval(100);
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