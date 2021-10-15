const app = require('express')();
const http = require('http').createServer(app);
const {logger, config, bus, utils} = require('@ucd-lib/krm-node-utils');
const io = require('socket.io')(http, {
  path : '/_/ws'
});

const registrations = {};

const kafka = bus.kafka;
const KAFKA_GROUP_ID = 'ws-service';

io.on('connection', (socket) => {
  logger.info('a user socket connected:', socket.id);

  socket.on('listen', (msg) => {
    try {
      let subjects = JSON.parse(msg);

      let current = registrations[socket.id];
      if( !current ) {
        current = {
          subjects : [],
          socket : socket
        }
        registrations[socket.id] = current;
      }

      subjects.forEach(subject => {
        let exists = current.subjects.find(ele => ele.href === subject.subject);
        if( exists ) return;

        let opts = subject.opts || {};
        subject = utils.subjectParser(subject.subject);
        subject.opts = opts;

        current.subjects.push(subject);
      });
    } catch(e) {
      logger.error('Failed to parse listen message: ', e);
    }
  });

  socket.on('unlisten', (msg) => {
    try {
      let subjects = JSON.parse(msg);

      let current = registrations[socket.id];
      if( !current ) {
        current = {
          subjects : [],
          socket : socket
        }
        registrations[socket.id] = current;
      }

      subjects.forEach(subject => {
        let index = current.subjects.findIndex(ele => ele.href === subject);
        if( index === -1 ) return;
        current.subjects.splice(index, 1);
      });
    } catch(e) {
      logger.error('Failed to parse unlisten message: ', e);
    }
  });

  socket.on('disconnect', () => {
    if( registrations[socket.id] ) {
      delete registrations[socket.id];
    }
  });
});

http.listen(3000, () => {
  logger.info('listening on *:3000');
});

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
        for( subject of reg.subjects ) {
          if( subject.path.regex.test(msg.subject) ) {

            if( subject.opts.entireMessage ) {
              reg.socket.emit('message', msg);
            } else {
              reg.socket.emit('message', {subject: msg.subject});
            }

            break;
          }
        }
      }
    } catch(e) {
      logger.error('Failed to handle kafka message: ', msg, e);
    }
  });
})();