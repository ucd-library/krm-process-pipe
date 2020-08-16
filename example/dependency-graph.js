const CA_CONUS_CELLS = /^(2-3|4-5|5-6)$/;
const CA_FULLDISK_CELLS = /^(2-3|4-5|5-6)$/;
const LATEST_BANDS = /^(2|3)$/;

module.exports = {
  name : 'casita',
  graph : {
    'file:///latest/:band/ca.png' : {
      name : 'Latest California Imagery',
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

    'http://library.ucdavis.edu/fire-detectio/goes-r-fulldisk-cell' : {
      name : 'Full Disk Cell',
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.png',
      }],
      command : msg => `echo ${msg.subject}`,
    },

    'http://library.ucdavis.edu/fire-detection/goes-r-conus-cell' : {
      name : 'Full Disk Cell',
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.png',
      }],
      command : msg => `echo ${msg.subject}`,
    },

    'file:///fulldisk/:date/:time/cells/:cell/:band/image.png' : {
      name : 'Full Disk Cell',
      dependencies : [{
        subject : 'file:///fulldisk/:date/:time/cells/:cell/:band/image.jp2',
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`,
    },

    'file:///conus/:date/:time/cells/:cell/:band/image.png' : {
      name : 'CONUS Cell',
      dependencies : [{
        subject : 'file:///conus/:date/:time/cells/:cell/:band/image.jp2',
      }],
      command : (msg,opts) => `touch ${opts.fs.nfsRoot}${opts.uri.pathname}`
    }

  }
}