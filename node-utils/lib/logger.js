const bunyan = require('bunyan');
const fs = require('fs');
const config = require('./config');

const streams = [
  // Log to the console
  { stream: process.stdout }
];

// wire in stack driver if google cloud service account provided
let projectId;
if( fs.existsSync(config.google.serviceAccountFile) ) {
  let {LoggingBunyan} = require('@google-cloud/logging-bunyan');

  // grab project id from service account file
  let accountFile = require(config.google.serviceAccountFile);

  // create bunyan logger for stackdriver
  projectId = accountFile.project_id;
  let loggingBunyan = new LoggingBunyan({
    projectId: accountFile.project_id,
    keyFilename: config.google.serviceAccountFile,
    resource : {type: 'project'}
  });

  // add new logger stream
  streams.push(loggingBunyan.stream());
}


let logger = bunyan.createLogger({
  name: config.logging.name,
  level: config.logging.level,
  streams: streams
});

let info = {
  name: config.logging.name,
  level: config.logging.level,
  stackdriver : {
    enabled : projectId ? true : false,
    file : config.google.serviceAccountFile
  }
}
if( projectId ) {
  info.stackdriver.projectId = projectId;
}

logger.info('logger initialized', info);

module.exports = logger;