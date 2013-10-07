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

  defaults = {
    handlers: {},
    views: {},
    timeout: 3 * 1000,
    exitStatus: 1,
    server: undefined,
    shutdown: undefined
  };

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
 *        options.views.default
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
 * @return {function} errorHandler Express error 
 *         handling middleware.
 */
module.exports = function createHandler(options) {

  var o = mixIn({}, defaults, options),

    /**
     * In case of an error, wait for a timer to
     * elapse, and then terminate.
     * @param  {Number} status Exit status code.
     */
    exit = o.shutdown || function exit(o){

      // Give the app time for graceful shutdown.
      setTimeout(function () {
        process.exit(o.exitStatus);
      }, o.timeout);

    };

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
  return function errorHandler(err,
      req, res, next) {

    var defaultView = o.views['default'];

    // If there's a custom handler defined,
    // use it and return.
    if (typeof o.handlers[err.status] ===
        'function') {
      return o.handlers[err.status](err,
        req, res, next);
    }

    // If there's a custom view defined,
    // render it and return.
    if (o.views[err.status]) {
      return res.render(o.views[err.status],
        err);
    }

    // If the error is user generated, send
    // a helpful error message, and don't shut
    // down.
    // 
    // If we shutdown on user errors,
    // attackers can send malformed requests
    // for the purpose of creating a Denial 
    // Of Service (DOS) attack.
    if ((err.status > 399 && err.status < 500) ||
        err.status === 503) {

      if (defaultView) {
        return res.render(defaultView, err);
      }

      return res.send(err.status);
    }

    // For all other errors, deliver a 500
    // error and shut down.
    if (defaultView) {
      res.render(defaultView, err);
    } else {
      res.send(500);
    }

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
      o.server.close(function () {
        process.exit(o.exitStatus);
      });
    }

    // Just in case the server.close() callback
    // never fires, this will wait for a timeout
    // and then terminate. Users can override
    // this function by passing options.shutdown:
    exit(o);
  };
};
