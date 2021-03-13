const Admin = require('../Admin');

module.exports = async function ensureTopic(topic, config) {
  let admin = new Admin({
    'metadata.broker.list': config['metadata.broker.list']
  });

  let resp;
  try {
    resp = await admin.createTopic(topic);
  } catch(e) {
    resp = e;
  }

  admin.disconnect();

  return resp;
}