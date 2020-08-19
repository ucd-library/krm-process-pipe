
class MemoryStore {

  constructor() {
    this.data = {};
  }

  set(data) {
    this.data[data.id] = data;
  }

  remove(id) {
    delete this.data[id];
  }

  get(id) {
    return this.data[id];
  }

  getBySubject(product) {
    return this._getBy('subject', product);
  }

  _getBy(key, value) {
    let results = [];
    for( let id in this.data ) {
      if( this.data[id][key] === value ) {
        results.push(this.data[id]);
      }
    }
    return results;
  }

}

module.exports = new MemoryStore();