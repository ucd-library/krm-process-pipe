const Worker = require('./lib/worker');

(async function() {
  let worker = new Worker();
  worker.connect();
})();