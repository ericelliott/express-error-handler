'use strict';

var test = require('tape'),
  createHandler = require('../error-handler.js'),
  through = require('through'),
  mixIn = require('mout/object/mixIn'),

  refreshCreateHandler = function() {
    // Clear the error-handler from require cache so we can have a 
    //  fresh look at the createHandler state.
    delete require.cache[require.resolve('../error-handler.js')];
    createHandler = require('../error-handler.js');
  },

  format = function format (types) {
    return types['text']();
  },

  testError = new Error('Test error'),
  testReq = function () { return {}; },
  testRes = function (config) {
    return mixIn({
      send: function send() {},
      end: function end() {},
      header: function header(headers) {
        this.headers = headers;
      },
      format: format,
      status: function (statusCode) {
        this.statusCode = statusCode;
        return this;
      }
    }, config);
  },
  testNext = function () {};


test('Custom shutdown', function (t) {
  var shutdown = function shutdown() {
      t.pass('Should call custom shutdown');
      t.end();
    },

    handler = createHandler({shutdown: shutdown});

  handler( testError, testReq(), testRes(),
      testNext );
});

test('Custom exit status', function (t) {
  var status = 11,
    shutdown = function shutdown(options) {
      t.strictEqual(options.exitStatus, status,
        'Should use custom exit status code');

      t.end();
    },

    handler = createHandler({
      shutdown: shutdown,
      exitStatus: status
    });

  handler( testError, testReq(), testRes(),
      testNext );
});

test('Custom handler', function (t) {
  var shutdown = function shutdown() {},
    e = new Error(),

    handler = createHandler({
      shutdown: shutdown,
      handlers: {
        '404': function err404() {
          t.pass('Should use custom handlers ' +
            'for status codes');
          t.end();
        }
      }
    });

  e.status = 404;

  handler( e, testReq(), testRes(),
      testNext );
});

test('Missing error status', function (t) {
  var shutdown = function shutdown() {},
    e = new Error(),

    handler = createHandler({
      shutdown: shutdown,
      handlers: {
        '404': function err404() {
          t.pass('Should get status from ' +
            'res.statusCode');
          t.end();
        }
      }
    }),
    res = testRes();

  res.statusCode = 404;

  handler( e, testReq(), res,
      testNext );
});

test('Custom views', function (t) {
  var shutdown = function shutdown() {},
    e = new Error(),

    handler = createHandler({
      shutdown: shutdown,
      views: {
        '404': '404 view'
      }
    }),
    res = testRes({
      render: function render() {
        t.pass('Render should be called for ' + 
          'custom views.');
        t.end();
      }
    });

  e.status = 404;

  handler(e, testReq(), res, testNext);
});

test('Error with status default behavior', 
    function (t) {

  var shutdown = function shutdown() {
      t.fail('shutdown should not be called.');
    },
    e = new Error(),
    status = 404,
    handler = createHandler({
      shutdown: shutdown
    }),
    res = testRes({
      send: function send() {
        t.equal(res.statusCode, status,
          'res.statusCode should be set to err.status');
        t.end();
      },
      format: format
    });

  e.status = status;

  handler(e, testReq(), res, testNext);
});

test('Default error status for non-user error', 
    function (t) {

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    status = 511,
    defaultStatus = 500,
    res = testRes({
      send: function send() {
        t.equal(res.statusCode, defaultStatus,
          'res.statusCode should be set to default status');
        t.end();
      },
      format: format
    });

  e.status = status;

  handler(e, testReq(), res, testNext);
});

test('Custom timeout', 
    function (t) {

  var shutdown = function shutdown(options) {
      t.equal(options.timeout, 4 * 1000,
        'Custom timeout should be respected.');
      t.end();
    },
    handler = createHandler({
      timeout: 4 * 1000,
      shutdown: shutdown
    });

  handler(testError, testReq(), testRes(), testNext);
});

test('Static file', function (t) {
  var
    buff = [],
    sample = 'foo',
    output,

    shutdown = function shutdown() {},

    e = (function () {
      var err = new Error();
      err.status = 505;
      return err;
    }()),

    handler = createHandler({
      static: {
        '505': './test/test-static.html'
      },
      shutdown: shutdown
    }),

    res = through(function (data) {
      buff.push(data);
    }, function () {
      output = Buffer.concat(buff).toString('utf8')
        .trim();

      t.strictEqual(output, sample,
        'Should send static file.');

      t.end();
    });

  res.status = res.status || function(code){
    res.statusCode = code;
    return res;
  };

  handler(e, testReq(), res, testNext);
});

test('.isClientError()', function (t) {
  var
    serverPass = [399, 500].every(function (err) {
      return !createHandler.isClientError(err);
    }),
    clientPass = [400, 401, 499].every(function(err) {
      return createHandler.isClientError(err);
    });

  t.ok(serverPass,
    'Non client errors should be correctly identified.');
  t.ok(clientPass,
    'Client errors should be correctly identified.');

  t.end();
});

test('Default static file', function (t) {
  var shutdown = function shutdown() {},

    buff = [],
    sample = 'foo',
    output,

    e = (function () {
      var err = new Error();
      err.status = 505;
      return err;
    }()),

    handler = createHandler({
      static: {
        'default': './test/test-static.html'
      },
      shutdown: shutdown
    }),

    res = through(function (data) {
      buff.push(data);
    }, function () {
      output = Buffer.concat(buff).toString('utf8')
        .trim();

      t.strictEqual(output, sample,
        'Should send static file.');

      t.end();
    });

  res.status = res.status || function(code){
    res.statusCode = code;
    return res;
  };

  handler(e, testReq(), res, testNext);
});

test('.restify()', function (t) {
  var route,
    shutdown = function shutdown() {
      t.pass('Should return restify handler.');
      t.end();
    },

    handler = createHandler({
      shutdown: shutdown,
      framework: 'restify'
    });

  // Restify uses a different signature:
  handler(testReq(), testRes(), route, testError);
});

test('.create() http error handler', function (t) {
  var next = function (err) {
      t.equal(err.status, 405,
        'Status message should be set on error.');
      t.equal(err.message, 'Method Not Allowed',
        'Should set message correctly.');
      t.end();
    },
    handler = createHandler.httpError(405);

  handler(null, null, next);
});

test('JSON error format', 
    function (t) {

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    res = testRes({
      send: function send(obj) {
        t.equal(obj.status, 500,
          'res.send() should be called ' + 
          'with error status on response body.');
        t.equal(obj.message, 'Internal Server Error',
          'res.send() should be called ' + 
          'with error message on response body.');
        t.end();
      },
      format: function format (types) {
        return types['json']();
      }
    });

  e.status = 500;

  handler(e, testReq(), res, testNext);
});

test('JSON with custom error message', 
    function (t) {

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    res = testRes({
      send: function send(obj) {
        t.equal(obj.message, 'half baked',
          'res.send() should be called ' + 
          'with custom error message.');
        t.end();
      },
      format: function format (types) {
        return types['json']();
      }
    });

  e.status = 420;
  e.message = 'half baked';

  handler(e, testReq(), res, testNext);
});


test('JSON with serializer', 
    function (t) {

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown,
      serializer: function (body) {
        return {
          status: body.status,
          message: body.message,
          links: [
            {self: '/foo'}
          ]
        };
      }
    }),
    res = testRes({
    send: function send(obj) {
        t.equal(obj.links[0].self, '/foo',
          'Should be able to define a custom ' +
          'serializer for error responses.');
        t.end();
      },
      format: function format (types) {
        return types['json']();
      }
    });

  e.status = 500;

  handler(e, testReq(), res, testNext);
});

test('maintenance enabled, fallback retyAfter, error status 503 kept for non-user error', 
    function (t) {
  refreshCreateHandler();

  process.env.ERR_HANDLER_MAINT_ENABLED = 'TRUE';

  // setup for maintenance
  var maintHandler = createHandler.maintenance();

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    status = 503,
    defaultStatus = 500,
    res = testRes({
      send: function send() {        
        t.equal(res.statusCode, status,
          'res.statusCode should be kept for maintenance condition');
        t.deepEqual(res.headers, { 'Retry-After': 3600 },
          "Fallback retry-after response header should be set");
        t.end();        
      },
      format: format
    });

  e.status = status;

  maintHandler(testReq(), res, testNext);
  handler(e, testReq(), res, testNext);  
});

test('maintenance enabled, set env vars, retryAfter seconds', 
    function (t) {
  refreshCreateHandler();

  process.env.ERR_HANDLER_MAINT_ENABLED = 'TRUE';
  process.env.ERR_HANDLER_MAINT_RETRYAFTER = 7200;

  // setup for maintenance
  var maintHandler = createHandler.maintenance();

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    status = 503,
    defaultStatus = 500,
    res = testRes({
      send: function send() {        
        t.equal(res.statusCode, status,
          'res.statusCode should be kept for maintenance condition');
        t.deepEqual(res.headers, { 'Retry-After': 7200 },
          "Explicit retry-after response header should be set");
        t.end();        
      },
      format: format
    });

  e.status = status;

  maintHandler(testReq(), res, testNext);
  handler(e, testReq(), res, testNext);
});

test('maintenance enabled, set env vars, retryAfter date', 
    function (t) {
  refreshCreateHandler();

  var raDate = 'Fri, 31 Dec 1999 23:59:59 GMT';
  process.env.ERR_HANDLER_MAINT_ENABLED = 'TRUE';
  process.env.ERR_HANDLER_MAINT_RETRYAFTER = raDate;

  // setup for maintenance
  var maintHandler = createHandler.maintenance();

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    status = 503,
    defaultStatus = 500,
    res = testRes({
      send: function send() {        
        t.equal(res.statusCode, status,
          'res.statusCode should be kept for maintenance condition');
        t.deepEqual(res.headers, { 'Retry-After': raDate },
          "Explicit retry-after response header should be set");
        t.end();        
      },
      format: format
    });

  e.status = status;

  maintHandler(testReq(), res, testNext);
  handler(e, testReq(), res, testNext);  
});

test('maintenance overridden, retry after response should be set', 
    function (t) {
  refreshCreateHandler();

  var retryAfterSeconds = 14400;

  // these better be irrelevant
  process.env.ERR_HANDLER_MAINT_ENABLED = 'TRUE';
  process.env.ERR_HANDLER_MAINT_RETRYAFTER = retryAfterSeconds-10;

  // setup for maintenance
  var maintHandler = createHandler.maintenance({
    status: function() { return true; },
    retryAfter: function () { return retryAfterSeconds; }
  });

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    }),
    status = 503,
    defaultStatus = 500,
    res = testRes({
      send: function send() {
        t.deepEqual(res.headers,
          { 'Retry-After': retryAfterSeconds },
          "503 retry-after response header should be set");
        t.end();
      },
      format: format
    });

  e.status = status;

  maintHandler(testReq(), res, testNext);
  handler(e, testReq(), res, testNext);
});

test('.maintenance.status', function (t) {
  refreshCreateHandler();

  var result, handler;

  result = createHandler.maintenance.status();
  t.equal(result, false, 'Should always be false before maintenance creation');

  // setup for maintenance
  createHandler.maintenance();

  delete process.env.ERR_HANDLER_MAINT_ENABLED;
  handler = createHandler();
  result = createHandler.maintenance.status();
  t.equal(result, false, 'Should be false if no maintenance');

  process.env.ERR_HANDLER_MAINT_ENABLED = 'FALSE';
  handler = createHandler();
  result = createHandler.maintenance.status();
  t.equal(result, false, 'Should be false if maintenance disabled in env');

  process.env.ERR_HANDLER_MAINT_ENABLED = 'TRUE';
  handler = createHandler();
  result = createHandler.maintenance.status();
  t.equal(result, true, 'Should be true if maintenance enabled in env');

  refreshCreateHandler();
  createHandler.maintenance({
    status: function() { return false; }
  });

  handler = createHandler();
  result = createHandler.maintenance.status();
  t.equal(result, false, 'Should be false if status overridden to disabled');

  refreshCreateHandler();
  createHandler.maintenance({
    status: function() { return true; }
  });
  handler = createHandler();
  result = createHandler.maintenance.status();
  t.equal(result, true, 'Should be true if 503 and maintenance enabled');

  t.end();
});