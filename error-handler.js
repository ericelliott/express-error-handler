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

  /**
   * The default management of the maintenance state.
   * If no arguments, reads ERR_HANDLER_MAINT_ENABLED environment 
   * variable to determine if maintenance is enabled.
   *
   * If a state is supplied, set the environment variable
   * and return the new enabled state.
   *
   * If the env var contains a reasonable value that denotes
   * a disabled condition, that is honored.
   *
   * @param {string} The new state to set ERR_HANDLER_MAINT_ENABLED to
   * @returns {boolean} True if maintenance is enabled, false otherwise
   */
  maintenanceState = function maintenanceState(state) {
    if (arguments.length > 0) {
      process.env.ERR_HANDLER_MAINT_ENABLED = state;
    }
    var value = process.env.ERR_HANDLER_MAINT_ENABLED;
    var negative = {
      '0': true, 'false': true, 'no': true, 'undefined': true
    };
    return !!(value && !negative[value.toLowerCase()]);
  },

  /**
   * Get the default maintenance Retry-After value.
   * Uses a fallback of 3600 seconds (1 hour) because
   * this function is called only if the user has set 
   * the maintenance to enabled (and therefore wants
   * a maintenance response to occur).
   *
   * If the server responds with a 503 and no Retry-After
   * header, the client treats it as a 500 per HTTP spec.
   *
   * Value can be seconds from now (for a relative Retry-After),
   * or an HTTP-date (RFC2822 GMT per spec, but ISO 8601 or 
   * other form may be preferable). Assume user knows best.
   *
   * @returns The value for the Retry-After response header.
   */
  maintenanceRetryAfter = function maintenanceRetryAfter() {
    var result, value = process.env.ERR_HANDLER_MAINT_RETRYAFTER;
    // fallback b/c user wants maintenance & no Retry-After means 500
    var fallback = 3600;
    // First, try seconds
    result = parseInt(value, 10);
    result = (result === 0 || (result && result < 0)) ? fallback : result;
    if (!result) {
      // NaN, try date
      result = Date.parse(value) && value || fallback;
    }
    return result;
  },

  /**
   * Takes an optional message and returns middleware
   * to conditionally invoke the errorHandler if 
   * maintenance is enabled.
   *
   * About getEnabled
   * If this is called after the errorHandler is created,
   * use the possibly overriden enabled method.
   * Otherwise use the default method.
   *
   * @param {string} message
   * @returns {function} conditional maintenance middleware
   */
  maintenance = function maintenance(message) {
    return function conditional503(req, res, next) {
      var err;
      var getEnabled = 
        (typeof maintenance._maintEnabled === 'function' && 
         maintenance._maintEnabled) ||
        maintenanceState;

      if (getEnabled()) {
        err = new Error();
        err.status = 503;
        err.message = message ||
          statusCodes[err.status];
      }
      next(err);
    };
  },

  sendFile = function sendFile (staticFile, res) {
    var filePath = path.resolve(staticFile),
      stream = fs.createReadStream(filePath);
    stream.pipe(res);
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
    framework: 'express',
    maintenance: {
      enabled: maintenanceState,
      retryAfter: maintenanceRetryAfter
    }
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
 * @param {object} [options.maintenance] Optionally override
 *        the default maintenance state management.
 * @member {function} [options.maintenance.enabled]
 * @returns True if maintenance mode is enabled, false otherwise.
 * @member {function} [options.maintenance.retryAfter]
 * @returns The value for the Retry-After response header.
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
    /**
     * Test if maintenance condition exists.
     * @param {number} status
     * @returns {boolean} true if maintenance condition
     */
    isMaintenance = function isMaintenance(status){
      return (status === 503 &&
        typeof o.maintenance.enabled === 'function' &&
        o.maintenance.enabled()
        );
    },
    /**
     * Make a response header for maintenance condition.
     * If retryAfter returns falsey, don't add header.
     * @returns {object} Retry-After response header
     */
    maintHeader = function maintHeader(){
      var retryAfter = (typeof o.maintenance.retryAfter === 'function' &&
        o.maintenance.retryAfter());
      return retryAfter ? { 'Retry-After': retryAfter } : {};
    },

    express = o.framework === 'express',
    restify = o.framework === 'restify',
    errorHandler;

  // Update the maintenance API.
  maintenance._maintEnabled = o.maintenance.enabled;

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

      resumeOrClose = function
          resumeOrClose(status) {
        if (!isClientError(status) && !isMaintenance(status)) {
          return close(o, exit);
        }
      };

    if (!res) {
      return resumeOrClose(status);
    }

    // If maintenance, set maintenance response header.
    if (isMaintenance(status)) {
      res.header(maintHeader());
    }

    // Always set a status.
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
      sendFile(staticFile, res);
      return resumeOrClose(status);
    }

    // If the error is user generated, send
    // a helpful error message, and don't shut
    // down.
    // 
    // If we shutdown on user errors,
    // attackers can send malformed requests
    // for the purpose of creating a Denial 
    // Of Service (DOS) attack.
    if (isClientError(status) || isMaintenance(status)) {
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

// The Maintenance API
maintenance.status = function(state) {
  var enabledDefined = typeof this._maintEnabled === 'function';
  var enabled = enabledDefined ? this._maintEnabled() : false;

  // A word on using the state argument.
  // This is useful to manage the state in this one process environment.
  // If you are using a service provider with multiple processes
  // that maybe go up and down
  // *don't use this function to set the maintenance state*
  // In other words: Don't supply a state argument, ever.
  // Instead use your provider's controlpanel/command to set the environment var
  // for your Computing/Dyno/Whatever instances.
  if (arguments.length > 0) {

    if (enabledDefined && this._maintEnabled !== maintenanceState) {
      // The Courtesy Throw
      // If options.maintenance.enabled has been overridden,
      // the user already manages the state, so this was a mistake.
      // Reason: 
      // The user has told us they manage the maintenance state elsewhere.
      // Argument:
      // Why would the user manage their own state, then give us their
      // management callback *AND THEN* use this lib to call their own
      // callback? (nonsense, I say. E_IRRELEVANT_COUPLING)
      throw new Error(
        'options.maintenance.enabled was overridden, '+
        'so the caller manages the maintenance state.'
      );
    }

    // Yep, call the default (see above test and explanation)
    enabled = maintenanceState(state);
  }

  return enabled; 
}.bind(maintenance);
createHandler.maintenance = maintenance;

// Client Error Functions
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
