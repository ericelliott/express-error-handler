express-error-handler
=====================

A graceful error handler for Express applications. This also patches a DOS exploit where users can manually trigger bad request errors that shut down your app.

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

## Configuration errorHandler(options)

Here are the parameters you can pass into the `errorHandler()` middleware:

* @param {object} [options]

* @param {object} [options.handlers] Custom handlers for specific status codes.
* @param {object} [options.views] View files to render in response to specific status codes. Specify a default with `options.views.default`
* @param {object} [options.static] Static files to send in response to specific status codes. Specify a default with options.static.default.
* @param {number} [options.timeout] Delay between the graceful shutdown attempt and the forced shutdown timeout.
* @param {number} [options.exitStatus] Custom process exit status code.
* @param {object} [options.server] The app server object for graceful shutdowns.
* @param {function} [options.shutdown] An alternative shutdown function if the graceful shutdown fails.
* @param {function} serializer a function to customize the JSON error object. Usage: serializer(err) return errObj
* @param {function} framework Either 'express' (default) or 'restify'.

* @return {function} errorHandler Express error handling middleware.

### Examples:

`express-error-handler` lets you specify custom templates, static pages, or error handlers for your errors. It also does other useful error-handling things that every app should implement, like protect against 4xx error DOS attacks, and graceful shutdown on unrecoverable errors. Here's how you do what you're asking for:


```js
var errorHandler = require('express-error-handler'),
  handler = errorHandler({
    handlers: {
      '404': function err404() {
        // do some custom thing here...
      }
    }
  });

// After all your routes...
// Pass a 404 into next(err)
app.use( errorHandler.httpError(404) );

// Handle all unhandled errors:
app.use( handler );
```

Or for a static page:

```js
handler = errorHandler({
  static: {
    '404': function err404() {
      // do some custom thing here...
    }
  }
});
```

Or for a custom view:
```js
handler = errorHandler({
  views: {
    '404': function err404() {
      // do some custom thing here...
    }
  }
});
```

[More examples](https://github.com/dilvie/express-error-handler/tree/master/examples) are available in the examples folder.

## errorHandler.isClientError(status)

Return true if the error status represents a client error that should not trigger a restart.

* @param  {number} status
* @return {boolean}

### Example

```js
errorHandler.isClientError(404); // returns true
errorHandler.isClientError(500); // returns false
```

## errorHandler.httpError(status, [message])

Take an error status and return a route that sends an error with the appropriate status and message to an error handler via `next(err)`.

* @param  {number} status
* @param  {string} message
* @return {function} Express route handler

```js
// Define supported routes
app.get( '/foo', handleFoo() );
// 405 for unsupported methods.
app.all( '/foo', createHandler.httpError(405) );
```

## errorHandler.maintenance([options])

Returns the middleware for responding to an application maintenance condition.
When a maintenance is enabled, the application responds to all requests with a `503` status and sets a `Retry-After` response header. In this case, the application will not shutdown. All middleware placed after the maintenance middleware will be skipped when a maintenance is enabled.

By default, maintenance is controlled using environment variables:
  * `ERR_HANDLER_MAINT_ENABLED` Set to 'TRUE' to enable an application maintenance condition, all other values are false.
  * `ERR_HANDLER_MAINT_RETRYAFTER` Can be a value in seconds (for relative) or an HTTP compliant GMT date (for absolute). Defaults to 3600 seconds.

### options
Specify options if you need to override the behavior of reading values from the environment variables.
* `status` A function that returns truthy to enable a maintenance condition.
* `retryAfter` A function that returns a value {Number|HTTP_Date} to specify in 'Retry-After' header.

### References
* [HTTP 503](http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.5.4)
* [Retry-After](http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.37)

To send a user friendly page along with the maintenance condition, setup a handler for `503`.
### Example
```javascript
var express = require('express'),
    errorHandler = require('express-error-handler'),
    http = require('http'),
    logger = require('morgan'),
    app = express(),
    env = process.env,
    port = env.PORT || 3000,
    server;

// Create the server to pass to the error handler
server = http.createServer(app);

// Middleware installed before maintenance always runs
app.use(logger());

// Respond to maintenance conditions
app.use(errorHandler.maintenance());

//
// Any middleware installed here is skipped when maintenance
// is enabled.
// app.use(...);
// app.use(...);
// ...
//

// Create and install the errorHandler.
app.use(errorHandler({
  server: server,
  views: {
    '503': function err503() {
      if (errorHandler.maintenance.status()) {
        // This is a maintenance condition, not an error,
        // respond with a nice maintenance page.
      } else {
        // Server simply overloaded, log and respond
      }
    }
  }
}));

server.listen(port, function () {
  console.log('Listening on port ' + port);
});
```

## Restify support

Restify error handling works different from Express. To trigger restify mode, you'll need to pass the `framework` parameter when you create the errorHandler:

```js
var handleError = errorHandler({
  server: server
  framework: 'restify'
});
```

In restify, `next(err)` is synonymous with `res.send(status, error)`. This means that you should *only use `next(err)` to report errors to users*, and not as a way to aggregate errors to a common error handler. Instead, you can invoke an error handler directly to aggregate your error handling in one place.

There is no error handling middleware. Instead, use `server.on('uncaughtException', handleError)`

See the examples in `./examples/restify.js`


## Credit and Thanks

Written by [Eric Elliott](http://ericelliottjs.com/) for the book, ["Programming JavaScript Applications"](http://pjabook.com) (O'Reilly)

* [Nam Nguyen](https://github.com/gdbtek) for bringing the Express DOS exploit to my attention.
* [Samuel Reed](https://github.com/strml) for helpful suggestions.
