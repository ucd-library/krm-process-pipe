const bunyan = require('bunyan');
const fs = require('fs');
const config = require('./config');

const streams = [
  // Log to the console
  { stream: process.stdout, level: config.logging.level }
];

// wire in stack driver if google cloud service account provided
let projectId;
if( fs.existsSync(config.google.serviceAccountFile) && 
    !fs.lstatSync(config.google.serviceAccountFile).isDirectory() &&
    (process.env.GC_LOGGING || '').toLowerCase() == 'true') {

  let {LoggingBunyan} = require('@google-cloud/logging-bunyan');

  // grab project id from service account file
  let accountFile = require(config.google.serviceAccountFile);

  // create bunyan logger for stackdriver
  projectId = accountFile.project_id;
  let loggingBunyan = new LoggingBunyan({
    projectId: accountFile.project_id,
    keyFilename: config.google.serviceAccountFile
    // resource : {type: 'project'}
  });

  // add new logger stream
  streams.push(loggingBunyan.stream(config.logging.level));
}


let logger = bunyan.createLogger({
  name: config.logging.name,
  // level: config.logging.level,
  streams: streams
});

let info = {
  name: config.logging.name,
  level: config.logging.level,
  customServiceAccount : {
    enabled : projectId ? true : false,
    file : config.google.serviceAccountFile
  }
}
if( projectId ) {
  info.customServiceAccount.projectId = projectId;
}

logger.info('logger initialized', info);

module.exports = logger;