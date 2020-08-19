

class MemoryQueue {

  constructor() {
    this.queues = {};
    this.workers = {};
  }

  setBus(bus) {
    this.bus = bus;
  }

  add(item) {
    let queue = this.taskMap[item.type];
    if( !queue ) {
      queue = [];
      this.taskMap[item.type] = queue;
    }

    let priority = JSON.parse(item.data).priority || 5;

    if( priority < 5 ) queue.unshift(item);
    else queue.push(item);
  }

}