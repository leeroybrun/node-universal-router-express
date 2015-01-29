var fs = require('fs');
var async = require('async');
var express = require('express');

// Create a new Express server
var HTTPserver = function(host, port) {
    this.host = host || process.env.HOST;
    this.port = port || process.env.PORT;

    this.express  = null;
    this.server = null;
};

// Initialize Express app and HTTPS server
HTTPserver.prototype.initialize = function(callback) {
    var server = this;

    // Create HTTPS server and express app
    try {
        var srvOptions = {
            key  : fs.readFileSync(utils.getFullPath(config.web.https.key)),
            ca   : fs.readFileSync(utils.getFullPath(config.web.https.ca)),
            cert : fs.readFileSync(utils.getFullPath(config.web.https.cert))
        };

        try {
            server.express = express();
            server.server = require('https').createServer(srvOptions, server.express);

            return callback();
        } catch(e) {
            logger.error('Cannot start server with given configuration, please check host & port config.');
            logger.error(e);

            return callback(new Error());
        }
    } catch(e) {
        logger.error('Please generate SSL certificates or update path in config.');

        return callback(new Error());
    }
};

// Register Express middlewares and listen for new middlewares to add
HTTPserver.prototype.registerMiddlewares = function(callback) {
    var server = this;

    var bodyParser = require('body-parser');
    var compression = require('compression');
    var serveStatic = require('serve-static');

    server.sessionStore = require('express-session')({
        name: config.web.sidKey
        secret: config.web.cookieSecret,
        resave: false,
        saveUninitialized: true
    });

    server.cookieParser = require('cookie-parser')(config.web.cookieSecret);

    server.express.use(server.cookieParser);
    server.express.use(server.sessionStore);

    server.express.use(bodyParser.json());
    server.express.use(bodyParser.urlencoded({ extended: false }));
    server.express.use(compression());
    server.express.use(serveStatic(utils.getFullPath('client/dist')));
    server.express.use('/content/img', serveStatic(utils.getFullPath('content/img')));
    server.express.use('/language', serveStatic(utils.getFullPath('content/language')));

    // When middlewares are added, add them to the Express server
    events.on('middlewares:add', function(middlewares) {
        middlewares.forEach(function(mw) {
            server.express.use(routes);
        });
    });

    return callback();
};

// Register Express routes and listen for new routes to add
HTTPserver.prototype.registerRoutes = function(callback) {
    var server = this;

    var viewsPath = utils.getFullPath('client/dist/views');
    var routes = {
        start: function(req, res, next) {
            res.sendfile(viewsPath +'/index.html');
        },

        partials: function(req, res, next) {
            var fileName = (req.params.dir) ? req.params.dir +'/'+ req.params.name : req.params.name;
            res.sendfile(viewsPath +'/' + fileName +'.html');
        }
    };

    server.express.get('/', routes.start);
    server.express.get('/partials/:dir/:name', routes.partials);
    server.express.get('/partials/:name', routes.partials);

    // When routes are added to router, add them to the Express server
    events.on('router:add', function(route) {
        server.addRoute(route.method, route.path, route.target);
    });

    //server.express.get('*', routes.start);

    return callback();
};

// Add routes to Express
HTTPserver.prototype.addRoutes = function(routes) {
    for(var path in routes) {
        // Add all route methods to Express app
        for(var method in routes[path]) {
            this.addRoute(method, path, routes[path][method]);
        }
    }
};

// Add route to Express
HTTPserver.prototype.addRoute = function(method, path, target) {
    this.express[method]('/api/'+ path, target);
};

// Start the Express server
HTTPserver.prototype.start = function(callback) {
    var server = this;

    async.waterfall([
        server.initialize,
        server.registerMiddlewares,
        server.registerRoutes
    ], function(err) {
        if(err) {
            return callback(err);
        }

        server.server.listen(server.port, server.host, null, function() {
            console.log('Server listening on port %d in %s mode', this.address().port, app.settings.env);

            return callback();
        });
    });
};

module.exports = HTTPserver;