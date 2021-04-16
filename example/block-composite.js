module.exports = {
  description : 'Merge and convert JP2 fragments',
  container : IMAGE_WORKER,

  dependsOn : {
    window : '5min',
    steps : [{
      id : 'goesr-product',
      // filter on image product guids
      filter : [
        `{{steps.goesr-product.details.band}} != undefined`,
        {
          exec : '',
          script : '// inline script',
          container : ''
        }
      ]
    }]
  },

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
      image : 'node',
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
    image : 'node',
    exec : 'node',
    script : 'console.log({{steps.goesr-product}}.map(item => item.details.file).join(" "))',
    output : {
      'input-files' : {
        from : 'stdout'
      }
    }
  },

  cmd : {
    image : 'image-utils',
    exec : 'node-image-utils jp2-to-png {{response.output-file}} {{response.inputs-files}}',
  }

}