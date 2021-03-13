module.exports = {
  description : 'Merge and convert JP2 fragments',
  container : IMAGE_WORKER,

  dependsOn : [{
    id : 'goesr-product',
    // filter on image product guids
    filter : [
      `{{steps.goesr-product.details.band}} == 2`,
      {
        exec : '',
        script : '// inline script',
      }
    ]
  }],

  groupBy : {
    key : [
      '{{steps.goesr-product.details.satellite}}',
      '{{steps.goesr-product.details.date}}',
      '{{steps.goesr-product.details.hour}}',
      '{{steps.goesr-product.details.minsec}}',
      '{{steps.goesr-product.details.band}}',
      '{{steps.goesr-product.details.apid}}',
      '{{steps.goesr-product.details.block}}'
    ],
    window : '5min',
    ready : {
      exec : 'node',
      script : 'console.log({{steps.goesr-product}}.length === 7)',
    },
    debounce : '1s'
  },

  prepare : {
    'output-file' : [
      '{{config.fs.nfsRoot}}',
      '/{{steps.goesr-product.details.satellite}}',
      '/{{steps.goesr-product.details.scale}}',
      '/{{steps.goesr-product.details.date}}',
      '/{{steps.goesr-product.details.hour}}',
      '/{{steps.goesr-product.details.minsec}}',
      '/{{steps.goesr-product.details.band}}',
      '/{{steps.goesr-product.details.apid}}',
      '/blocks/{{steps.goesr-product.details.block}}',
      '/image.png'
    ]
  },

  preCmd : {
    exec : 'node',
    script : 'console.log({{steps.goesr-product}}.map(item => item.details.file).join(" "))',
    output : {
      'input-files' : {
        from : 'stdout'
      },

      'outputdata' : {
        from : 'file',
        type : 'json',
        path : 'foo/bar.json'
      }
    }
  },

  cmd : {
    exec : 'node-image-utils jp2-to-png {{response.output-file}} {{response.inputs-files}}',
  }



  // finalize : {
  //   'input-files' : '{{steps.goesr-product}}.map(item => item.details.file).join(" ")',
  //   'output-file' : [
  //     '{{config.fs.nfsRoot}}',
  //     '/{{steps.goesr-product.details.satellite}}',
  //     '/{{steps.goesr-product.details.scale}}',
  //     '/{{steps.goesr-product.details.date}}',
  //     '/{{steps.goesr-product.details.hour}}',
  //     '/{{steps.goesr-product.details.minsec}}',
  //     '/{{steps.goesr-product.details.band}}',
  //     '/{{steps.goesr-product.details.apid}}',
  //     '/blocks/{{steps.goesr-product.details.block}}',
  //     '/image.png'
  //   ]
  // }
}