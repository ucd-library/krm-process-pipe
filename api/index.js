const express = require('express');
const serveIndex = require('serve-index');
const {logger, config} = require('@ucd-lib/krm-node-utils');
const httpProxy = require('http-proxy');

const cors = require('cors')({
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  exposedHeaders : ['content-type', 'link', 'content-disposition', 'content-length', 'pragma', 'expires', 'cache-control'],
  allowedHeaders : ['authorization', 'range', 'cookie', 'content-type', 'prefer', 'slug', 'cache-control', 'accept'],
  credentials: true
});

const app = express();
const server = require('http').createServer(app);

const proxy = httpProxy.createProxyServer();
proxy.on('error', err => logger.warn('api proxy error', err));

const wsServiceMap = {};

app.use(cors);

// handle websocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  for( let hostname in wsServiceMap ) {
    if( wsServiceMap[hostname].test(req.url) ) {
      proxy.ws(req, socket, head, {
        target: 'ws://'+hostname+':3000'+req.url,
        ignorePath: true
      });
      return;
    }
  }
});

// register services
for( let service of config.api.services ) {
  logger.info(`Creating api service route /_/${service.route} to http://${service.hostname}`);
  
  // required to handle websocket upgrade requests
  wsServiceMap[service.hostname] = new RegExp(`^/_/${service.route}(/.*|$)`);

  app.use(wsServiceMap[service.hostname], (req, res) => {
    proxy.web(req, res, {
      target: 'http://'+service.hostname+':3000'+req.originalUrl,
      ignorePath: true
    });
  });
}

app.use(express.static(config.fs.nfsRoot), serveIndex(config.fs.nfsRoot, {'icons': true}));

server.listen(3000, async () => {
  logger.info('api listening to port: 3000');
});