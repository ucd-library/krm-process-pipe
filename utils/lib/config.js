const fs = require('fs-extra');
const path = require('path');
const {URL} = require('url');

const ROOT_FS = path.resolve(__dirname, '..', '..', 'storage');
const SERVER_URL = process.env.SERVER_URL || 'http://casita.library.ucdavis.edu';


module.exports = {
  fs : {
    root : ROOT_FS,
    workerRoot : path.join(ROOT_FS, 'workers'),
    nfsRoot : path.join(ROOT_FS, 'nfs')
  },

  task : {
    defaultType : 'casita.backend.task'
  },

  server : {
    url : new URL(SERVER_URL)
  }
}