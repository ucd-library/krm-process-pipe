const {logger, config} = require('@ucd-lib/krm-node-utils');
const CronJob = require('cron').CronJob;
const fs = require('fs-extra');
const path = require('path');

class Expire {

  constructor(path) {
    this.expireCron = new CronJob(config.cron.fsExpire, () => this.expire(path));
    this.expireCron.start();
  }

  async expire(folder) {
    if( !folder ) folder = config.fs.nfsRoot;
    // logger.info('Crawling: '+folder);

    let files = await fs.readdir(folder);
    let file, stat;

    for( file of files ) {
      file = path.join(folder, file);
      stat = fs.lstatSync(file);

      if( stat.isDirectory() ) {
        await this.expire(file);
        continue;
      }

      let age = Date.now() - stat.mtime.getTime();
      if( age > config.fs.expire * 1000 ) {
        logger.info('expire: '+file);
        await fs.remove(file);
      }
    }

    files = await fs.readdir(folder);
    if( files.length === 0 ) {
      await fs.remove(folder);
    }
  }
}

new Expire();