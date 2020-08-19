const EventEmitter = require('events');

class InMemoryBus extends EventEmitter {}

module.exports = new InMemoryBus();