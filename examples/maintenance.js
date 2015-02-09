'use strict';

var express = require('express'),
  errorHandler = require('../error-handler.js'),
  app = express(),
  env = process.env,
  port = env.PORT || 3000,
  http = require('http'),
  server;

// Send the app into maintenance mode from env.MAINT_FLAG.
// Unset env.MAINT_FLAG to disable.
app.use((function() {
  return env.MAINT_FLAG ? errorHandler.httpError(503) :
    function skippy(req, res, next) { return next(); };
}()));

//
// ... other middleware here...
// This middleware would be skipped in maintenance mode.
//

// Create the server object that we can pass
// in to the error handler:
server = http.createServer(app);

// Respond to errors and conditionally shutdown the server.
// Enable 503 maintenance with Retry-After responses with env.MAINT_FLAG.
// Will not shutdown server if maintenance is enabled.
app.use(errorHandler({
  server: server,
  maintenance: {
    enabled: function() {
      // Use environment variable to send a maintenance response
      //  on a 503 status.
      // Unset the environment variable to disable maintenance.
      return env.MAINT_FLAG;
    },
    retryAfterSeconds: function() {
      // Specify retry after time in seconds, default to 1 hour.
      return env.MAINT_RETRYAFTER || 3600;
    }
  },
  static: {
    // Replace these with paths that work
    '404': 'path/to/404.html',
    '503': 'path/to/503.html'
  }
}));

server.listen(port, function () {
  console.log('Listening on port ' + port);
});