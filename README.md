express-error-handler
=====================

A graceful error handler for Express applications.

## Quick start:

```js
var express = require('express'),
  errorHandler = require('../error-handler.js'),
  app = express(),
  env = process.env,
  port = env.myapp_port || 3000,
  http = require('http'),
  server;

// Route that triggers a sample error:
app.get('/error', function createError(req,
    res, next) {
  var err = new Error('Sample error');
  err.status = 500;
  next(err);
});

// Create the server object that we can pass
// in to the error handler:
server = http.createServer(app);

// Log the error
app.use(function (err, req, res, next) {
  console.log(err);
  next(err);
});

// Respond to errors and conditionally shut
// down the server. Pass in the server object
// so the error handler can shut it down
// gracefully:
app.use( errorHandler({server: server}) );

server.listen(port, function () {
  console.log('Listening on port ' + port);
});
```

## Configuration

Here are the parameters you can pass into the `errorHandler()` middleware:

* @param {object} [options]

* @param {object} [options.handlers] Custom handlers for specific status codes.

* @param {object} [options.views] View files to render in response to specific status codes. Specify a default with `options.views.default`
* @param {object} [options.static] Static files to send in response to specific status codes. Specify a default with options.static.default.
* @param {number} [options.timeout] Delay between the graceful shutdown attempt and the forced shutdown timeout.
* @param {number} [options.exitStatus] Custom process exit status code.
* @param {object} [options.server] The app server object for graceful shutdowns.
* @param {function} [options.shutdown] An alternative shutdown function if the graceful shutdown fails.
* @return {function} errorHandler Express error handling middleware.

See the tests for more examples.


## errorHandler.clientError()

Return true if the error status represents a client error that should not trigger a restart.

* @param  {number} status
* @return {boolean}


### Example

errorHandler.clientError(404); // returns true
errorHandler.clientError(500); // returns false