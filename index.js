const path = require('path');
const KrmController = require('./controller');
const Worker = require('./worker/lib/memory');

let controller = new KrmController(path.join(__dirname, './example/dependency-graph'));
new Worker(controller.bus);

controller.bus.on('task', msg => console.log('TASK READY', msg));

controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/5-6/3/image.jp2');
controller.add('file:///conus/2020-06-25/04:25:30/cells/4-5/3/image.jp2');
controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/4-5/3/image.jp2');
controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/2-3/3/image.jp2');

controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/5-6/3/image.png');
controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/4-5/3/image.png');
controller.add('file:///fulldisk/2020-06-25/04:25:30/cells/2-3/3/image.png');

Object.values(controller.state.data)
  .forEach(item => console.log(item));