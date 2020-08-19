const CA_CONUS_CELLS = /^(2-3|4-5|5-6)$/;
const CA_FULLDISK_CELLS = /^(2-3|4-5|5-6)$/;
const LATEST_BANDS = /^(2|3)$/;

const LATEST_CA_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_CONUS_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_FULLDISK_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_IMAGE = 'image.casita.library.ucdavis.edu';
const FIRE_DETECTION_IMAGE = 'fire-detection.casita.library.ucdavis.edu';

module.exports = {
  name : 'casita',
  graph : {
    'file:///latest/:band/ca.png' : {
      name : 'Latest California Imagery',
      worker : LATEST_CA_WORKER,
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS,
          cell : CA_CONUS_CELLS
        }
      },{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS,
          cell : CA_FULLDISK_CELLS
        }
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
      options : {
        run: 'everytime'
      }
    },

    'file:///latest/:band/conus.png' : {
      name : 'Latest CONUS Imagery',
      worker : LATEST_CONUS_WORKER,
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS
        }
      },{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS,
          cell : CA_FULLDISK_CELLS
        }
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
      options : {run: 'everytime'}
    },

    'file:///latest/:band/fulldisk.png' : {
      name : 'Latest fulldisk Imagery',
      worker : LATEST_FULLDISK_WORKER,
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS
        }
      },
      {
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          band : LATEST_BANDS
        }
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
      options : {run: 'everytime'}
    },

    'file:///conus/:date/:time/:band/conus-ca.png' : {
      name : 'California Image CONUS',
      worker : LATEST_IMAGE,
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          cells : CA_CONUS_CELLS
        }
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
      options : {
        dependentCount : 3,
        timeoutWindow : 60 * 2
      }
    },

    'file:///fulldisk/:date/:time/:band/fulldisk-ca.png' : {
      name : 'California Image Fulldisk',
      worker : LATEST_IMAGE,
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
        constraints : {
          cells : CA_FULLDISK_CELLS
        }
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
      options : {
        dependentCount : 3,
        timeoutWindow : 60 * 2
      }
    },

    'http://casita.library.ucdavis.edu/fire-detection/fulldisk-cell/:date/:time/:cell/:band' : {
      name : 'Full Disk Cell',
      worker : FIRE_DETECTION_IMAGE,
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
      }],
      command : msg => `echo ${msg.subject}`,
    },

    'http://casita.library.ucdavis.edu/fire-detection/conus-cell/:date/:time/:cell/:band' : {
      name : 'Full Disk Cell',
      worker : FIRE_DETECTION_IMAGE,
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
      }],
      command : msg => `echo ${msg.subject}`,
    },

    'file:///fulldisk/:date/:time/cells/:cell/:band/image.png' : {
      name : 'Full Disk Cell',
      worker : LATEST_IMAGE,
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.jp2',
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
    },

    'file:///conus/:date/:time/cells/:cell/:band/image.png' : {
      name : 'CONUS Cell',
      worker : LATEST_IMAGE,
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.jp2',
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`
    }

  }
}