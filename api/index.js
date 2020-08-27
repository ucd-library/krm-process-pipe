const express = require('express');
// const Busboy = require('busboy');
// const path = require('path');
// const os = require('os');
// const fs = require('fs-extra');
// const uuid = require('uuid');
const {logger, config, bus} = require('@ucd-lib/krm-node-utils');

// const kafka = bus.kafka;
const app = express();

// const kafkaProducer = new kafka.Producer({
//   'metadata.broker.list': config.kafka.host+':'+config.kafka.port
// });

// app.use((req, res, next) => {
//   if( req.method !== 'POST' ) return next();

//   let busboy = new Busboy({ headers: req.headers });
//   req.body = {};

//   busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
//     // TODO: this needs to be a docker mount!
//     let tmpFile = path.join(os.tmpdir(), Math.random()*Date.now()+'');
//     file.pipe(fs.createWriteStream(tmpFile));
//     req.body[fieldname] = {fieldname, file, filename, encoding, mimetype, tmpFile};
//   });
//   busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
//     req.body[fieldname] = {fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype};
//   });
//   busboy.on('finish', () => next());

//   req.pipe(busboy);
// });

// async function cleanFiles(req) {
//   if( !req.body ) return;
//   try {
//     for( let key in req.body ) {
//       let param = req.body[key];
//       if( !param.file ) continue;

//       try {
//         if( fs.existsSync(param.tmpFile) ) {
//           await fs.unlink(param.tmpFile);
//         }
//       } catch(e) {
//         logger.error('Failed to clean files', req.body, e);
//       }
      
//     }
//   } catch(e) {
//     logger.error('Failed to clean files', req.body, e);
//   }
// }

// app.post('/', async (req, res) => {
//   if( !req.body.path ) {
//     return res.status(400).json({
//       error: {
//         message : 'Invalid parameters'
//       },
//       details : 'Path parameters required'
//     });
//   }

//   let subject;
//   try {
//     let nfsPath = path.join(config.fs.nfsRoot, req.body.path.val, req.body.file.filename);

//     if( !req.body.file ) {
//       if( !fs.existsSync(nfsPath) ) {
//         return res.status(400).json({
//           error: {
//             message : 'Invalid parameters'
//           },
//           details : 'File not provided and path does not already exist on disk'
//         });
//       }
//     } else {
//       if( fs.existsSync(nfsPath) ) {
//         await fs.unlink(nfsPath);
//       }
//       await fs.move(req.body.file.tmpFile, nfsPath);
//     }

//     subject = 'file://'+path.join('/', req.body.path.val, req.body.file.filename);
//     await sendSubjectReady(subject);
//     res.send({success: true, subject})
//   } catch(e) {
//     logger.error('Failed to proxy subject: '+subject, e);
//     return res.status(400).json({
//       error: {
//         message : e.details,
//         stack : e.stack
//       }
//     });
//   }

//   cleanFiles(req);
// });

// function sendSubjectReady(subject) {
//   let value = {
//     id : uuid.v4(),
//     time : new Date().toISOString(),
//     type : 'new.subject',
//     source : 'http://controller.'+config.server.url.hostname,
//     datacontenttype : 'application/json',
//     subject
//   }

//   logger.info('Api sending subject ready to kafka: ', subject)

//   return kafkaProducer.produce({
//     topic : config.kafka.topics.subjectReady,
//     value,
//     key : 'api'
//   });
// }

app.use(express.static(config.fs.nfsRoot));

app.listen(3000, async () => {
  logger.info('api listening to port: 3000');
  // await kafkaProducer.connect();
  // logger.info('api connected to kafka, ready to process');
});