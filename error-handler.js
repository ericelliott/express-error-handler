'use strict';

module.exports = function createHandler(server,
    options) {

  var handlers = options.handlers || {},
    views = options.views || {},
    timeout = options.timeout || 3 * 1000,
    shutdown = options.shutdown,

    /**
     * In case of an error, wait for a timer to
     * elapse, and then terminate.
     * @param  {Number} status Exit status code.
     */
    exit = shutdown || function exit(status) {
      // Give the app time for graceful shutdown.
      setTimeout(function () {
        process.exit(status || 1);
      }, timeout);
    };

  /**
   * Express error handler to handle any
   * uncaught express errors.
   * For error logging, see 
   * 
   * @param  {Object}   err 
   * @param  {Object}   req
   * @param  {Object}   res
   * @param  {Function} next
   */
  return function errorHandler(err,
      req, res, next) {

    if (typeof handlers[err.status] ===
        'function') {
      return handlers[err.status](err,
        req, res, next);
    }

    if (options.views[err.status]) {
      return res.render(options
        .views[err.status]);
    }

    if ((err.status > 399 && err.status < 500) ||
        err.status === 503) {

      // If we shutdown on user errors,
      // attackers can send malformed requests
      // with the express purpose of creating a
      // Denial Of Service (DOS) attack.
      //
      // If the user can do something about the
      // error, send a helpful status message
      // and don't shut down.
      return res.send(err.status);
    }

    // For all other errors, deliver a 500
    // error and shut down.
    res.send(500);

    // We need to kill the server process so
    // the app can repair itself. Your process 
    // should be monitored in production and
    // restarted when it shuts down.
    // 
    // That can be accomplished with modules
    // like forever, forky, etc...
    if (server && typeof server.close ===
        'function') {
      server.close(function () {
        process.exit(1);
      });
    }

    // Just in case the server.close() callback
    // never fires, this will wait for a timeout
    // and then terminate:
    exit();
  };
};
