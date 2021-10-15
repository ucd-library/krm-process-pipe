const http2 = require('http2');
const fs = require('fs');
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

/**
 * Load the shortcuts.  This allows for simpler pre-defined routes
 */
let shortCuts = config.eventShortcuts;
if( shortCuts ) {
  logger.info('Using shortcut routes: ', Object.keys(shortCuts));
}

/**
 * Called every time a new h2 connection starts
 */
server.on('stream', (stream, headers, flags) => {
  const method = headers[HTTP2_HEADER_METHOD];

  // only accept GET paths
  if( method !== 'GET' ) {
    stream.respond({
      [HTTP2_HEADER_STATUS]: 404
    });
    stream.end();
    return;
  }

  let subject, shortcut;
  let path = headers[HTTP2_HEADER_PATH];
  let orgPath = path;
  const id = uuid.v4();

  // decode the path, either checking for a shortcut path are parsing the provided URI 
  try {
    path = decodeURIComponent(path.replace('/_/h2/', ''));
    if( shortCuts && shortCuts[path] ) {
      shortcut = shortCuts[path];
    } else {
      subject = utils.subjectParser(path);
    }

  } catch(e) {
    // if something goes wrong, bail out
    stream.respond({
      [HTTP2_HEADER_STATUS]: 500,
      [HTTP2_HEADER_CONTENT_TYPE]: 'application/json'
    });
    write(stream, {
      error: true,
      path : orgPath,
      subject : path,
      shortcut,
      message : e.message
    });
    stream.end();
    return;
  }

  // send response headers, h2 style
  stream.respond({
    [HTTP2_HEADER_STATUS]: 200,
    [HTTP2_HEADER_CONTENT_TYPE]: 'application/x-ndjson'
  });

  // register h2 connection (stream) with subject or shortcut requested
  registrations[id] = {
    path, stream, subject, shortcut
  };

  // send connected message so they know all is set
  write(stream, {connected: true, subject: path, shortcut : shortcut ? true : false});

  // when the stream does finally close (on the user side), delete the registration
  stream.on('close', () => delete registrations[id]);
});

// start main h2-only service
server.listen(3000, () => {
  logger.info('listening on *:3000');
});

// helper function for writing json-newline to stream
function write(stream, msg) {
  stream.write(JSON.stringify(msg)+'\n');
}

// TODO: we probably should start at 'earliest' but just start streaming from connection time
(async function() {
  // setup kafka connection and subscribe the the subject-ready topic
  this.kafkaConsumer = new kafka.Consumer({
    'group.id': KAFKA_GROUP_ID,
    'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    'enable.auto.commit': true
  });
  await this.kafkaConsumer.connect();
  await this.kafkaConsumer.subscribe([config.kafka.topics.subjectReady]);

  // start consuming messages
  await this.kafkaConsumer.consume(msg => {
    try {
      let raw = msg.value.toString('utf-8');
      msg = JSON.parse(raw);

      // check registrations (h2 connections) against message subject
      let id, reg, subject;
      for( id in registrations ) {
        reg = registrations[id];
        
        if( reg.shortcut && reg.shortcut.test(msg.subject) ) {
          write(reg.stream, {subject: msg.subject});
        } else if( reg.subject && reg.subject.path.regex.test(msg.subject) ) {

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