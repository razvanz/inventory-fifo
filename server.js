/*eslint global-require: 0*/
'use strict';

const _ = require('lodash');
const bodyParser = require('body-parser');
const createError = require('http-errors');
const express = require('express');
const morgan = require('morgan');
const Seneca = require('seneca');

module.exports = function (config) {
  const seneca = Seneca();
  const Inventory = require('./src/inventory');
  seneca.use(Inventory.plugin.bind(seneca, config));

  // Initialize express app
  const app = express();

  app.enable('jsonp callback');
  app.disable('x-powered-by');
  // Setting application local variables
  app.locals.title = config.title;
  app.locals.version = config.version;

  if(config.log)
    app.use(morgan('dev'));

  // Passing the request url to environment locals
  app.use((req, res, next) => {
    res.locals.url = `${req.protocol}://${req.headers.host}${req.url}`;
    next();
  });
  // Request body parsing middleware should be above methodOverride
  app.use(bodyParser.urlencoded({
    extended: true
  }));
  app.use(bodyParser.json());

  /****************************************************************************
   * ROUTES
   ***************************************************************************/
  app.route('/ping')
   .get((req, res) => {
     // Alive check
     return res.send('pong');
   });

  app.route('/customer/:cust_id/product/:prd_id')
    .put((req, res, next) => {
      seneca.act({role: 'inventory', cmd: req.body.operation}, {
        params: req.params,
        body: req.body
      }, (err, data) => {
        if (err)
          return next(err);

        return res.status(200).end();
      });
    });

  app.route('/customer/:cust_id/product/:prd_id/summary')
    .get((req, res, next) => {
      seneca.act({role: 'inventory', cmd: 'summary'}, {
        params: req.params,
        query: req.query
      }, (err, data) => {
        if (err)
          return next(err);

        return res.status(200).end();
      });
    });

  app.route('/customer/:cust_id/product/:prd_id/log')
    .get((req, res, next) => {
      seneca.act({role: 'inventory', cmd: 'log'}, {
        params: req.params,
        query: req.query
      }, (err, data) => {
        if (err)
          return next(err);

        return res.jsonp(data);
      });
    });

  // 404
  app.use((req, res, next) => {
    return next(createError(404));
  });


  /****************************************************************************
   * ERROR HANDLING
   ***************************************************************************/
  app.use((err, req, res, next) => {
    // Add a default statusCode to the error
    if (!err.statusCode)
      err = createError(500, err);

    return next(err);
  });

  app.use((err, req, res, next) => {
    /*eslint no-unused-vars:0*/
    if (!res.headersSent)
      return res.status(err.statusCode)
        .jsonp({
          code: err.code,
          name: err.name,
          message: err.message,
          statusCode: err.statusCode
        });
  });

  app.listen = app.listen.bind(app, config.port, config.host);
  return app;
};
