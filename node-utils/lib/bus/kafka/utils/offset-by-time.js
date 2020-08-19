const Kafka = require('node-rdkafka');

module.exports = function getOffsetByTime(config, topic, time) {
  config['enable.auto.commit'] = false;
  let client = new Kafka.KafkaConsumer(config);

  if( typeof topic === 'string' ) topic = {topic};
  if( !topic.partition ) topic.partition = 0;

  return new Promise((resolve, reject) => {
    let opts = {client, topic, time}

    client.connect(opts, (err, data) => {
      if( err ) return reject(err);
      
      client.queryWatermarkOffsets(topic.topic, topic.partition, 10000, async (err, offsets) => {
        if( err ) return reject(err);
        
        offsets.middle = Math.round((offsets.highOffset - offsets.lowOffset) / 2);
    
        try {
          resolve(await find(offsets, opts));
        } catch(e) {
          reject(e);
        }
      });
    });
  });
}

async function find(offsets, opts) {
  let msg = await readOne(offsets.middle, opts);


  if( time.getTime() < msg.timestamp ) {
    offsets.highOffset = offsets.middle;
    offsets.middle = Math.round((offsets.highOffset - offsets.lowOffset) / 2) + offsets.lowOffset;
    if( offsets.middle === offsets.highOffset || offsets.middle === offsets.lowOffset ) {
      return offsets.middle;
    }
    return find(offsets, opts);

  } else if( time.getTime() > msg.timestamp  ) {
    offsets.lowOffset = offsets.middle;
    offsets.middle = Math.round((offsets.highOffset - offsets.lowOffset) / 2) + offsets.lowOffset;
    if( offsets.middle === offsets.highOffset || offsets.middle === offsets.lowOffset ) {
      return offsets.middle;
    }
    return find(offsets, opts);
  }

  return offsets.middle;
}

function readOne(offset, opts) {
  let topic = Object.assign(opts.topic, {offset});
  consumer.assign(topic);

  return new Promise((resolve, reject) => {
    consumer.consume(1, (e, msgs) => {
      if( e ) reject(e);
      else if( !msgs.length ) resolve(null);
      else resolve(msgs[0]);
    });
  });
}