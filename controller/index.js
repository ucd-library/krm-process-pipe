const express = require('express');
const Busboy = require('busboy');
const KrmController = require('./lib/model');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const {logger, config} = require('@ucd-lib/krm-node-utils');

const model = new KrmController();
const app = express();

app.use((req, res, next) => {
  if( req.method !== 'POST' ) return next();

  let busboy = new Busboy({ headers: req.headers });
  req.body = {};

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    let tmpFile = path.join(os.tmpDir(), path.basename(fieldname));
    file.pipe(fs.createWriteStream(tmpFile));
    body.fieldname = {fieldname, file, filename, encoding, mimetype, tmpFile};
  });
  busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
    body.fieldname = {fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype};
  });
  busboy.on('finish', () => next());

  req.pipe(busboy);
});

app.post('/', (req, res) => {
  if( !req.body.path ) {
    return res.status(400).json({
      error: {
        message : 'Invalid parameters'
      },
      details : 'Path parameters required'
    });
  }

  try {
    let nfsPath = path.join(config.fs.nfsRoot, req.body.path.val, req.body.file.filename);

    if( !req.body.file ) {
      if( !fs.existsSync(nfsPath) ) {
        return res.status(400).json({
          error: {
            message : 'Invalid parameters'
          },
          details : 'File not provided and path does not already exist on disk'
        });
      }
    } else {
      await fs.move(req.body.file.tmpFile, nfsPath);
    }

    
    await model.add(path.join('/', req.body.path.val, req.body.file.filename));
  } catch(e) {
    return res.status(400).json({
      error: {
        message : e.details,
        stack : e.stack
      }
    });
  }

});

app.listen(3000, () => {
  logger.info('controller listening to port: 3000');
});