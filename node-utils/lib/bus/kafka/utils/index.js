module.exports = {
  ensureTopic : require('./ensure-topic'),
  offsetByTime : require('./offset-by-time'),
  getMsgId : msg => `${msg.topic}:${msg.partition}:${msg.offset}`
}