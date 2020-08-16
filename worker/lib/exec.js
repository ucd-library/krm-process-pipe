const {exec} = require('child_process');

module.exports = (cmd, args={}) => {
  if( !args.shell ) args.shell = '/bin/bash';
  return new Promise((resolve, reject) => {
    exec(cmd, args, (error, stdout, stderr) => {
      if( error ) reject(error);
      else resolve({stdout, stderr}); 
    });
  });
}