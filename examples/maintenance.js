'use strict';

var express = require('express'),
  errorHandler = require('../error-handler.js'),
  app = express(),
  env = process.env,
  port = env.PORT || 3000,
  http = require('http'),
  server;

//
// Any middleware here will always execute.
// app.use(middleware);
// ...

// Send the app into maintenance mode using env.ERR_HANDLER_MAINT_ENABLED
// Unset env.ERR_HANDLER_MAINT_ENABLED to disable.
// Or use the Maintenance API to get/set the env variable for this process:
// errorHandler.maintenance.status([true|false])
app.use(errorHandler.maintenance());

//
// Middleware here will be skipped in maintenance mode.
// app.use(othermiddleware1);
// app.use(othermiddleware2);
// ...

// Create the server object that we can pass
// in to the error handler:
server = http.createServer(app);

// Respond to errors and conditionally shutdown the server.
// Will not shutdown server if maintenance is enabled.
// The 503 maintenance response will send the Retry-After header
// using the value set in env.ERR_HANDLER_MAINT_RETRYAFTER.
// Value can be seconds or HTTP-Date (GMT).
// For more info:
//   503: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.5.4
//   Retry-After: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.37
app.use(errorHandler({
  server: server,
  static: {
    // Replace these with paths that work
    '404': 'path/to/404.html',
    '503': 'path/to/503.html'
  }
}));

server.listen(port, function () {
  console.log('Listening on port ' + port);
});