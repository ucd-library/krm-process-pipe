const fs = require('fs-extra');
const uuid = require('uuid');
const path = require('path');
const exec = require('./exec');
const config = require('../../utils/lib/config');
const {URL} = require('url');

class Worker {

  constructor(bus) {
    this.bus = bus;
    bus.on('task', msg => this.handleMessage(msg));
  }

  async handleMessage(msg) {
    msg.data = JSON.parse(msg.data);

    let uri = new URL(msg.subject);
    if( uri.protocol === 'file:' ) {
      await fs.mkdirp(
        path.join(config.fs.nfsRoot, path.parse(uri.pathname).dir)
      );
      msg.data.command = msg.data.command.replace(/{{ROOT}}/, config.fs.nfsRoot);
    }

    await this.run(msg);
  }

  async run(msg) {
    let {stdout, stderr} = await exec(msg.data.command);

    let completed = {
      id : uuid.v4(),
      time : new Date().toISOString(),
      type : msg.type+'.completed',
      source : 'http://worker.'+config.server.url.hostname,
      datacontenttype : 'application/json',
      subject : msg.subject,
      data : {
        stdout, 
        stderr,
        task: msg
      }
    }

    this.bus.emit('completed', completed);
  }

}

module.exports = Worker;
