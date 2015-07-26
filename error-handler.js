/**
 * express-error-handler
 *
 * A graceful error handler for Express
 * applications.
 *
 * Copyright (C) 2013 Eric Elliott
 *
 * Written for
 * "Programming JavaScript Applications"
 * (O'Reilly)
 *
 * MIT License
 **/

'use strict';

var mixIn = require('mout/object/mixIn'),
  path = require('path'),
  fs = require('fs'),
  statusCodes = require('http').STATUS_CODES,

  /**
   * Return true if the error status represents
   * a client error that should not trigger a
   * restart.
   *
   * @param  {number} status
   * @return {boolean}
   */
  isClientError = function isClientError(status) {
    return (status >= 400 && status <= 499);
  },

  /**
   * Attempt a graceful shutdown, and then time
   * out if the connections fail to drain in time.
   *
   * @param  {object} o options
   * @param  {object} o.server server object
   * @param  {object} o.timeout timeout in ms
   * @param  {function} exit - force kill function
   */
  close = function close(o, exit) {
    // We need to kill the server process so
    // the app can repair itself. Your process
    // should be monitored in production and
    // restarted when it shuts down.
    //
    // That can be accomplished with modules
    // like forever, forky, etc...
    //
    // First, try a graceful shutdown:
    if (o.server && typeof o.server.close ===
        'function') {
      try {
        o.server.close(function () {
          process.exit(o.exitStatus);
        });
      }
      finally {
        process.exit(o.exitStatus);
      }
    }

    // Just in case the server.close() callback
    // never fires, this will wait for a timeout
    // and then terminate. Users can override
    // this function by passing options.shutdown:
    exit(o);
  },

  /**
   * Take an error status and return a route that
   * sends an error with the appropriate status
   * and message to an error handler via
   * `next(err)`.
   *
   * @param  {number} status
   * @param  {string} message
   * @return {function} Express route handler
   */
  httpError = function httpError (status, message) {
    var err = new Error();
    err.status = status;
    err.message = message ||
      statusCodes[status] ||
      'Internal server error';

    return function httpErr(req, res, next) {
      next(err);
    };
  },

  sendFile = function sendFile (staticFile, res) {
    var filePath = path.resolve(staticFile),
      stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return stream;
  },

  send = function send(statusCode, err, res, o) {
    var body = {
        status: statusCode,
        message: err.message ||
          statusCodes[statusCode]
      };

    body = (o.serializer) ?
      o.serializer(body) :
      body;

    res.status(statusCode);
    res.send(body);
  },

  defaults = {
    handlers: {},
    views: {},
    static: {},
    timeout: 3 * 1000,
    exitStatus: 1,
    server: undefined,
    shutdown: undefined,
    serializer: undefined,
    framework: 'express'
  },
  createHandler;

/**
 * A graceful error handler for Express
 * applications.
 *
 * @param {object} [options]
 *
 * @param {object} [options.handlers] Custom
 *        handlers for specific status codes.
 *
 * @param {object} [options.views] View files to
 *        render in response to specific status
 *        codes. Specify a default with
 *        options.views.default.
 *
 * @param {object} [options.static] Static files
 *        to send in response to specific status
 *        codes. Specify a default with
 *        options.static.default.
 *
 * @param {number} [options.timeout] Delay
 *        between the graceful shutdown
 *        attempt and the forced shutdown
 *        timeout.
 *
 * @param {number} [options.exitStatus] Custom
 *        process exit status code.
 *
 * @param {object} [options.server] The app server
 *        object for graceful shutdowns.
 *
 * @param {function} [options.shutdown] An
 *        alternative shutdown function if the
 *        graceful shutdown fails.
 *
 * @param {function} serializer A function to
 *        customize the JSON error object.
 *        Usage: serializer(err) return errObj
 *
 * @param {function} framework Either 'express'
 *        (default) or 'restify'.
 *
 * @return {function} errorHandler Express error
 *         handling middleware.
 */
createHandler = function createHandler(options) {

  var o = mixIn({}, defaults, options),

    /**
     * In case of an error, wait for a timer to
     * elapse, and then terminate.
     * @param {object} options
     * @param {number} o.exitStatus
     * @param {number} o.timeout
     */
    exit = o.shutdown || function exit(o){

      // Give the app time for graceful shutdown.
      setTimeout(function () {
        process.exit(o.exitStatus);
      }, o.timeout);

    },
    express = o.framework === 'express',
    restify = o.framework === 'restify',
    errorHandler;

  /**
   * Express error handler to handle any
   * uncaught express errors. For error logging,
   * see bunyan-request-logger.
   *
   * @param  {object}   err
   * @param  {object}   req
   * @param  {object}   res
   * @param  {function} next
   */
  errorHandler = function errorHandler(err, req,
      res, next) {

    var defaultView = o.views['default'],
      defaultStatic = o.static['default'],
      status = err && err.status ||
        res && res.statusCode,
      handler = o.handlers[status],
      view = o.views[status],
      staticFile = o.static[status],

      renderDefault = function
          renderDefault(statusCode) {

        res.statusCode = statusCode;

        if (defaultView) {
          return res.render(defaultView, err);
        }

        if (defaultStatic) {
          return sendFile(defaultStatic, res);
        }

        if (restify) {
          send(statusCode, err, res, o);
        }

        if (express) {
          return res.format({
            json: function () {
              send(statusCode, err, res, {
                serializer: o.serializer || function (o) {
                  return o;
                }
              });
            },
            text: function () {
              send(statusCode, err, res, {
                serializer: function (o) {
                  return o.message;
                }
              });
            },
            html: function () {
              send(statusCode, err, res, {
                serializer: function (o) {
                  return o.message;
                }
              });
            }
          });
        }
      },

      shouldContinue = function
          shouldContinue(status) {
        return isClientError(status) || status === 503;
      },

      resumeOrClose = function
          resumeOrClose(status) {
        if (!shouldContinue(status)) {
          return close(o, exit);
        }
      };

    if (!res) {
      return resumeOrClose(status);
    }

    // Always set a response status.
    res.status(status);

    // If there's a custom handler defined,
    // use it and return.
    if (typeof handler === 'function') {
      handler(err, req, res, next);
      return resumeOrClose(status);
    }

    // If there's a custom view defined,
    // render it.
    if (view) {
      res.render(view, err);
      return resumeOrClose(status);
    }

    // If there's a custom static file defined,
    // render it.
    if (staticFile) {
      var stream = sendFile(staticFile, res);
      stream.on('end', function () {
        resumeOrClose(status);
      });
      return;
    }

    // If the error is user generated, send
    // a helpful error message, and don't shut
    // down.
    //
    // If we shutdown on user errors,
    // attackers can send malformed requests
    // for the purpose of creating a Denial
    // Of Service (DOS) attack.
    if (shouldContinue(status)) {
      return renderDefault(status);
    }

    // For all other errors, deliver a 500
    // error and shut down.
    renderDefault(500);

    close(o, exit);
  };

  if (express) {
    return errorHandler;
  }

  if (restify) {
    return function (req, res, route, err) {
      return errorHandler(err, req, res);
    };
  }
};

/**
 * Maintenance middleware
 *
 * @param {object} [options]
 *
 * @param {function} [options.status] - Returns Boolean to indicate
 * the application is in maintenance mode. Default reads
 * ERR_HANDLER_MAINT_ENABLED environment variable - Value must be
 * 'TRUE' to indicate an active maintenance condition, any other value
 * is false.
 *
 * @param {function} [options.retryAfter] - Returns
 * Number or String value for Retry-After response header.
 * Default reads ERR_HANDLER_MAINT_RETRYAFTER environment variable -
 * Value must be a positive integer for retry after relative seconds,
 * or an HTTP-date in GMT to indicate an absolte retry after period.
 *
 * The default retryAfter implementation will return a fallback value of 3600
 * seconds (1 hour). This is because retryAfter is only used if a
 * maintenance condition is TRUE. To be an effective maintenance condition,
 * the Retry-After response header must be defined with a legitimate value,
 * or else the clients MUST interpret the response as a 500. Since the user
 * already expressed a maintenance condition exists, this fallback makes it
 * so even if ERR_HANDLER_MAINT_RETRYAFTER is bad.
 *
 * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.5.4
 * @see http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.37
 */
createHandler.maintenance = function maintenance(options) {
  options = options || {};

  var
    status = typeof options.status === 'function' ?
      options.status :
      function status () {
        return ('' + process.env.ERR_HANDLER_MAINT_ENABLED)
          .trim().toLowerCase() === 'true';
      },

    retryAfter = typeof options.retryAfter === 'function' ?
      options.retryAfter :
      function retryAfter() {
        var
          seconds, trySeconds,
          envSetting = ('' + process.env.ERR_HANDLER_MAINT_RETRYAFTER).trim(),
          fallback = 3600;

        trySeconds = parseInt(envSetting, 10);
        seconds = (trySeconds === 0 || (trySeconds && trySeconds < 0)) ?
          fallback : trySeconds;

        return seconds || (Date.parse(envSetting) && envSetting || fallback);
      };

  // Update exposed status method to any 503 handlers
  createHandler.maintenance.status = status;

  return function maintenanceMiddleware(req, res, next) {
    var
      maintenanceMode = function maintenanceMode() {
        res.header({ 'Retry-After': retryAfter() });
        return httpError(503)(req, res, next);
      };

    if ( status() ) {
      return maintenanceMode();
    } else {
      return next();
    }
  };
};
// Updated if user creates maintenance middleware.
createHandler.maintenance.status = function() { return false; };

// isClientError functions
createHandler.isClientError = isClientError;
createHandler.clientError = function () {
  var args = [].slice.call(arguments);

  console.log('WARNING: .clientError() is ' +
    'deprecated. Use isClientError() instead.');

  return this.isClientError.apply(this, args);
};

// HTTP error generating route.
createHandler.httpError = httpError;

module.exports = createHandler;
