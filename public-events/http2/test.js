const http2 = require('http2');
const {
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_METHOD,
} = http2.constants;

let subject = 'file:///west/{scale}/{date}/{hour}/{minsec}/{band}/{apid}/blocks/{block}/fragments/{fragment}/image-fragment.jp2';
let currentData = '';

(async function() {
  let client = http2.connect(
    'http://localhost:3001'
  );

  let request = client.request({
    [HTTP2_HEADER_PATH]: '/_/h2/'+encodeURIComponent(subject),
    [HTTP2_HEADER_METHOD]: 'GET'
  });
  request.end();

  request.on('response', headers => console.log(headers));
  request.on('data', onData);
  request.on('close', () => console.log('Closed!'));
})();

function onData(line) {
  currentData += line.toString('utf-8');
  if( currentData.match(/\n/) ) {
    let parts = currentData.split('\n');
    if( parts[parts.length-1].length === 0 ) {
      currentData = parts.splice(parts.length-1, 1)[0];
    } else {
      parts.splice(parts.length-1, 1)[0];
    }
    parts.forEach(p => console.log(JSON.parse(p)));
  }
}