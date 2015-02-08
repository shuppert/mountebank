'use strict';

var http = require('http'),
    https = require('https'),
    url = require('url'),
    Q = require('q'),
    AbstractProxy = require('../abstractProxy'),
    combinators = require('../../util/combinators'),
    querystring = require('querystring'),
    helpers = require('../../util/helpers');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function create (logger) {

    function toUrl (path, query) {
        var tail = querystring.stringify(query);
        if (tail === '') {
            return path;
        }
        return path + '?' + tail;
    }

    function hostnameFor (protocol, host, port) {
        var result = host;
        if ((protocol === 'http:' && port !== 80) || (protocol === 'https:' && port !== 443)) {
            result += ':' + port;
        }
        return result;
    }

    function getProxyRequest (baseUrl, originalRequest) {
        var parts = url.parse(baseUrl),
            protocol = parts.protocol === 'https:' ? https : http,
            options = {
                method: originalRequest.method,
                hostname: parts.hostname,
                port: parts.port,
                auth: parts.auth,
                path: toUrl(originalRequest.path, originalRequest.query),
                headers: helpers.clone(originalRequest.headers)
            };
        options.headers.connection = 'close';
        options.headers.host = hostnameFor(parts.protocol, parts.hostname, parts.port);

        var proxiedRequest = protocol.request(options);
        if (originalRequest.body) {
            proxiedRequest.write(originalRequest.body);
        }
        return proxiedRequest;
    }

    function proxy (proxiedRequest) {
        var deferred = Q.defer();

        proxiedRequest.end();

        proxiedRequest.once('response', function (response) {
            var packets = [];

            response.on('data', function (chunk) {
                packets.push(chunk);
            });

            response.on('end', function () {
                var body = Buffer.concat(packets),
                    contentEncoding = response.headers['content-encoding'] || '',
                    mode = contentEncoding.indexOf('gzip') >= 0 ? 'binary' : 'text',
                    encoding = mode === 'binary' ? 'base64' : 'utf8',
                    stubResponse = {
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: body.toString(encoding),
                        mode: mode
                    };
                deferred.resolve(stubResponse);
            });
        });

        return deferred.promise;
    }

    return AbstractProxy.create({
        logger: logger,
        formatRequest: combinators.identity,
        formatResponse: combinators.identity,
        formatDestination: combinators.identity,
        getProxyRequest: getProxyRequest,
        proxy: proxy
    });
}

module.exports = {
    create: create
};
