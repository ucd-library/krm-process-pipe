const {MongoClient, ObjectId} = require('mongodb');
const logger = require('../logger');
const config = require('../config');

class Database {

  constructor() {
    this.db;
    this.connected = false;
    this.connecting = false; 
    this.ObjectId = ObjectId;
  }

  async connect() {
    if( this.connected ) return;

    if( this.connecting ) {
      return this.connecting;
    }

    var url = `mongodb://${config.mongo.host}:${config.mongo.port}`;
    logger.info('DATABASE: Connecting to MongoDB: '+url);


    this.connected = false;

    this.connecting = new Promise((resolve, reject) => {
      MongoClient.connect(url, (err, client) => {  
        if( err ) {
          logger.error('Failed to connect to Mongo', url, err);
          return reject(err);
        }
        this.db = client.db(config.mongo.dbName);

        this.connected = true;
        this.connecting = null;
        logger.info('DATABASE: Connected');

        this.db.on('close', () => {
          logger.warn('DATABASE: Disconnected from MongoDB');
          this.connected = false;
          setTimeout(() => this.connect(), 2000);
        });

        resolve(this.db);
      });
    });
    
    return this.connecting;
  }

  async getCollection(collection) {
    await this.connect();
    return this.db.collection(collection);
  }

}

module.exports = new Database();