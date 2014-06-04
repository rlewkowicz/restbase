"use strict";
var fs = require('fs'),
    path = require('path'),
    prfun = require('prfun'),
    readdir = Promise.promisify(fs.readdir),
    express = require('express'),
    log = function (level, msg) {
        if (/^error/.test(level)) {
            console.error(msg);
        } else {
            console.log(msg);
        }
    };

function isGenerator(fn) {
    return fn.constructor === function*(){}.constructor;
}

// Load all handlers from the handlers directory
function* loadHandlersGen () {
    var handlerNames = yield readdir('./handlers'),
        handlers = [];
    handlerNames.forEach(function(handlerName) {
        try {
            handlers.push(require(path.resolve('./handlers/' + handlerName)));
        } catch (e) {
            log('error/handler', e, handlerName);
        }
    });
    return handlers;
}
var loadHandlers = Promise.async(loadHandlersGen);

// Handle a single request
function* handleRequestGen (handler, req, resp) {
    try {
        // var req = massageReq(req);
        var restFaceInterface = {
            GET: function() {},
            PUT: function() {},
            POST: function() {}
        };

		// Call the end point handler to do the actual work
        var response = yield handler(restFaceInterface, req);

        if (response.headers) {
            resp.set(response.headers);
        }

        if (response.body) {
            resp.send(response.status || 500, response.body);
        }

    } catch (e) {
        log('error/request', e);
		// XXX: proper error reporting
		resp.send(500, e);
    }
}
var handleRequest = Promise.async(handleRequestGen);

// Main app setup
function* mainGen() {
    var app = express();
	// Load routes & handlers
    var handlers = yield loadHandlers();
    // Register routes + handlers with express
    handlers.forEach(function(handler) {
        var routes = handler.routes;
        routes.forEach(function(route) {
            console.log(route);
			// Add the route to express
            var appRoute = app.route(route.path);
            Object.keys(route.methods).forEach(function(verb) {
                var handler = route.methods[verb],
                    handlerFunc = handler.handler;
                if (isGenerator(handlerFunc)) {
                    // Convert into promise-returning function
                    handlerFunc = Promise.async(handlerFunc);
                }
				// And register the handler with the route
                appRoute[verb](handleRequest.bind(handleRequest, handlerFunc));
            });
        });
    });
    app.listen(8888);
}
var main = Promise.async(mainGen);

main()
.catch(function(e) {
	log('error', e);
});