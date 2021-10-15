const {URL} = require('url');

module.exports = function subjectParser(subject='*') {
  if( subject === '*' ) {
    return {
      href: '*',
      origin: '*',
      protocol: '*',
      host: '*',
      hostname: '*',
      port: '*',
      pathname: '*',
      search: '*',
      searchParams: '*',
      hash: '*',
      path : {
        args : [],
        parts : [],
        regex : /.*/
      }
    }
  }

  subject = new URL(subject);

  subject = {
    href: decodeURIComponent(subject.href),
    origin: subject.origin,
    protocol: subject.protocol,
    host: subject.host,
    hostname: subject.hostname,
    port: subject.port,
    pathname: decodeURIComponent(subject.pathname),
    search: subject.search,
    searchParams: subject.searchParams,
    hash: subject.hash,
    path : {
      args : [],
      parts : decodeURIComponent(subject.pathname).replace(/^\//, '').split('/')
    }
  }

  let regex = escapeRegExp(subject.href);
  let parts = subject.href.match(/{[a-zA-Z0-9_\\-]+}/g) || [];
  for( let part of parts ) {
    let argname = part.replace(/(^{|}$)/g, '');
    subject.path.args.push(argname);
    regex = regex.replace(part, '([A-Za-z0-9_\\-]+)');
  }

  subject.path.regex = new RegExp('^'+regex+'$');
  return subject;
}

function escapeRegExp(text) {
  return text.replace(/[-[\]()*+?.,\\^$|#\s]/g, '\\$&');
}