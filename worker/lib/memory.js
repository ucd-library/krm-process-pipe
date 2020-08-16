const fs = require('fs-extra');
const path = require('path');
const exec = require('./exec');

const ROOT_DIR = process.env.WORKER_ROOT_DIR || path.resolve(__dirname, '..', '..', 'nfs');

class Worker {

  constructor(bus) {
    bus.on('task', msg => this.handleMessage(msg));
  }

  handleMessage(msg) {
    // console.log(msg);
    msg.data = JSON.parse(msg.data);
    if( typeof msg.data.command === 'object' ) {
      if( msg.data.command.function ) {
        msg.data.command = eval('('+msg.data.command.function+')')(msg);
      }
    }

    console.log('worker', msg);
  }

}

module.exports = Worker;
