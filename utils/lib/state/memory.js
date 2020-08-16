
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
    for( let id in this.data ) {
      if( this.data[id][key] === value ) {
        return this.data[id];
      }
    }
    return null;
  }

}

module.exports = new MemoryStore();