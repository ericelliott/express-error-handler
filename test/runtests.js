'use strict';

var test = require('tape'),
  createHandler = require('../error-handler.js'),
  through = require('through'),

  testError = new Error('Test error'),
  testReq = function () { return {}; },
  testRes = function () {
    return {
      send: function send() {}
    };
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

test('Custom exit status', function (t) {
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

test('Custom views', function (t) {
  var shutdown = function shutdown() {},
    e = new Error(),

    handler = createHandler({
      shutdown: shutdown,
      views: {
        '404': '404 view'
      }
    });

  e.status = 404;

  handler(e, testReq(), {
    render: function render() {
        t.pass('Render should be called for ' + 
          'custom views.');
        t.end();
      }
    },testNext);
});

test('Error with status default behavior', 
    function (t) {

  var shutdown = function shutdown() {
      t.fail('shutdown should not be called.');
    },
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    });

  e.status = 404;

  handler(e, testReq(), {
    send: function send(status) {
        t.equal(status, 404,
          'res.send() should be called ' + 
          'with error status.');
        t.end();
      }
    }, testNext);
});

test('Default error status for non-user error', 
    function (t) {

  var shutdown = function shutdown() {},
    e = new Error(),
    handler = createHandler({
      shutdown: shutdown
    });

  e.status = 511;

  handler(e, testReq(), {
    send: function send(status) {
        t.equal(status, 500,
          'res.send() should be called ' + 
          'with default status.');
        t.end();
      }
    }, testNext);
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

  handler(e, testReq(), res, testNext);
});

test('.clientError()', function (t) {
  var
    serverPass = [399, 500].every(function (err) {
      return !createHandler.clientError(err);
    }),
    clientPass = [400, 401, 499].every(function(err) {
      return createHandler.clientError(err);
    });

  t.ok(serverPass,
    'Non client errors should be correctly identified.');
  t.ok(clientPass,
    'Client errors should be correctly identified.');

  t.end();
});