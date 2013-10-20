'use strict';

var restify = require('restify'),
  server = restify.createServer(),

  handleError = function handleError() {
    console.log('Caught error!'); // never hserverens
    setTimeout(function () {
      process.exit(1);
    }, 3000);
  },

  middlewareError =
      function middlewareError() {
    throw new Error('Random middleware error.');
  };


server.get('/err', function (req, res, next) {
  // This doesn't get caught.
  next( new Error('Random unrecoverable error. ' +
    'Server is now running in undefined state!') );
});

server.get('/thrower', function () {
  // This doesn't get caught.
  throw new Error('Random unrecoverable error. ' +
    'Server is now running in undefined state!');
});

// This gets caught, yay!
server.use(middlewareError);

server.get('/middleware', function () {
  // Placeholder to invoke middlewareError.
});

// This works for middleware. Fails for routes.
server.on('uncaughtException', handleError);

// Nope. This doesn't help.
process.on('uncaughtException', handleError);

server.listen(3000, function () {
  console.log('Listening on port 3000');
});
