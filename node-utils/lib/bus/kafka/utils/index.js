module.exports = {
  ensureTopic : require('./ensure-topic'),
  offsetByTime : require('./offset-by-time'),
  getMsgId : msg => `${msg.topic}:${msg.partition}:${msg.offset}`,
  getTopicName : (name) => name.replace(/[^A-Za-z0-9\.\-_]+/g, '_')
}