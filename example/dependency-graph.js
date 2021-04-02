const CA_CONUS_CELLS = /^(2-3|4-5|5-6)$/;
const CA_FULLDISK_CELLS = /^(2-3|4-5|5-6)$/;
const LATEST_BANDS = /^(2|3)$/;

const IMAGE_WORKER = 'ucdlib/casita-image-utils';

const LATEST_CA_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_CONUS_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_FULLDISK_WORKER = 'latest-ca.casita.library.ucdavis.edu';
const LATEST_IMAGE = 'image.casita.library.ucdavis.edu';
const FIRE_DETECTION_IMAGE = 'fire-detection.casita.library.ucdavis.edu';

module.exports = {
  name : 'casita',

  enableQueue : true,

  images : {
    node : 'node:14',
    'image-utils' : 'ucdlib/casita-image-utils'
  },

  config : {
    fs : {
      nfsRoot : '/storage/nfs'
    }
  },

  schemas : [
    {
      "$id": "https://argonaut.library.ucdavis.edu/geosr-product.schema.json",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "title": "GOES-R Product",
      "description": "Data for a GOES-R product",
      "required": [ "satellite", "date", "hour","minsec","apid" ,"file"],
      "type": "object",
      "properties": {
        "satellite": {"type": "string"},
        "date": {"type": "string"},
        "hour": {"type": "string"},
        "minsec": {"type": "string"},
        "band": {"type": "string"},
        "apid": {"type": "string"},
        "block": {"type": "string"},
        "file": {"type": "string"},
      }
    }
  ],

  steps : {
    'goesr-product' : {
      description : 'Add new product to system',
      output : {
        details : {
          from : 'stdout',
          type : 'json',
          schema : "https://argonaut.library.ucdavis.edu/geosr-product.schema.json"
        }
      }
    },
 
    'block-composite' : require('./block-composite'),

    'web-block-composite' : {
      description : 'Merge and convert JP2 fragments',
      container : IMAGE_WORKER,
      cmd : [
        'node-image-utils scale',
        '--input={{steps.block-composite.message.file}}',
        '--band={{steps.goesr-product.details.band}}',
        '--output={{finalize.output-file}}'
      ],
      dependsOn : [{
        id : 'block-composite'
      }],
      finalize : {
        'output-file' : [
          '{{config.fs.nfsRoot}}',
          '/{{steps.goesr-product[0].details.satellite}}',
          '/{{steps.goesr-product[0].details.scale}}',
          '/{{steps.goesr-product[0].details.date}}',
          '/{{steps.goesr-product[0].details.hour}}',
          '/{{steps.goesr-product[0].details.minsec}}',
          '/{{steps.goesr-product[0].details.band}}',
          '/{{steps.goesr-product[0].details.apid}}',
          '/blocks/{{steps.goesr-product[0].details.block}}',
          '/web-scaled.png'
        ]
      }
    },

    'conus-composite' : {
      description : 'Merge conus png image blocks',
      container : IMAGE_WORKER,
      cmd : ['node-image-utils composite ${config.fs.nfsRoot}${uri.pathname}']
    }

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