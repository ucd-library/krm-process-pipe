const http2 = require('http2');
const uuid = require('uuid');
const {logger, config, bus, utils} = require('@ucd-lib/krm-node-utils');

const {
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_METHOD,
} = http2.constants;

const server = http2.createServer();
const registrations = {};
const kafka = bus.kafka;
const KAFKA_GROUP_ID = 'http2-service';

server.on('stream', (stream, headers, flags) => {
  const method = headers[HTTP2_HEADER_METHOD];

  if( method !== 'GET' ) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 404
    });
    stream.end();
    return;
  }

  let subject;
  let path = headers[HTTP2_HEADER_PATH];
  let orgPath = path;
  const id = uuid.v4();

  try {
    path = decodeURIComponent(path.replace('/_/h2/', ''));
    subject = utils.subjectParser(path);
  } catch(e) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 500,
      [HTTP2_HEADER_CONTENT_TYPE]: 'application/json'
    });
    stream.end(JSON.stringify({
      error: true,
      path : orgPath,
      subject : path,
      message : e.message
    }));
    return;
  }

  stream.respond({
    [HTTP2_HEADER_STATUS]: 200,
    [HTTP2_HEADER_CONTENT_TYPE]: 'application/x-ndjson'
  });


  registrations[id] = {
    path, stream, subject
  };
  write(stream, {connected: true, subject: path});

  stream.on('close', () => delete registrations[id]);
});

server.listen(3000, () => {
  logger.info('listening on *:3000');
});

function write(stream, msg) {
  stream.write(JSON.stringify(msg)+'\n');
}

(async function() {
  this.kafkaConsumer = new kafka.Consumer({
    'group.id': KAFKA_GROUP_ID,
    'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    'enable.auto.commit': true
  });
  await this.kafkaConsumer.connect();
  await this.kafkaConsumer.subscribe([config.kafka.topics.subjectReady]);

  await this.kafkaConsumer.consume(msg => {
    try {
      let raw = msg.value.toString('utf-8');
      msg = JSON.parse(raw);

      let id, reg, subject;
      for( id in registrations ) {
        reg = registrations[id];
        
        if( reg.subject.path.regex.test(msg.subject) ) {

          // if( subject.opts.entireMessage ) {
          //   reg.socket.emit('message', msg);
          // } else {
          write(reg.stream, {subject: msg.subject});
          // }
        }
        
      }
    } catch(e) {
      logger.error('Failed to handle kafka message: ', msg, e);
    }
  });
})();