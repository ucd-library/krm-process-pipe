const {logger, config} = require('@ucd-lib/krm-node-utils');
const CronJob = require('cron').CronJob;
const fs = require('fs-extra');
const path = require('path');

const DIRECTION = process.env.EXPIRE_DIRECTION || 'forward';

class Expire {

  constructor(path) {
    this.path = path || config.fs.nfsRoot;
    this.expireCron = new CronJob(config.cron.fsExpire, () => this.run());
    this.expireCron.start();
    this.run();
  }

  run() {
    logger.info(`Starting ${DIRECTION} expire process for ${this.path}`);
    this.expire(this.path);
  }

  async expire(folder) {
    let files;

    try {
      files = await fs.readdir(folder);
    } catch(e) {
      logger.warn('Failed to read directory: '+folder);
      return;
    }    

    if( DIRECTION === 'forward' ) {
      for( let i = 0; i < files.length; i++ ) {
        await this.removeFile(folder, files[i]);
      }
    } else {
      for( let i = files.length-1; i >= 0; i-- ) {
        await this.removeFile(folder, files[i]);
      }
    }

    try {
      files = await fs.readdir(folder);
    } catch(e) {
      logger.warn('Failed to read directory: '+folder);
      return;
    }

    if( files.length === 0 ) {
      try {
        await fs.remove(folder);
      } catch(e) {}
    }
  }

  async removeFile(folder, file) {
    let stat;
    file = path.join(folder, file);

    try {
      stat = fs.lstatSync(file);
    } catch(e) {
      return;
    }

    if( stat.isDirectory() ) {
      await this.expire(file);
      return;
    }

    let age = Date.now() - stat.mtime.getTime();
    if( age > config.fs.expire * 1000 ) {
      try {
        logger.debug('expire: '+file);
        await fs.remove(file);
      } catch(e) {}
    }
  }

}

new Expire();