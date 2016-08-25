'use strict';

const _ = require('lodash');
const assert = require('chai').assert;
const async = require('async');
const Seneca = require('seneca');
const uuid = require('uuid');

const inventory = require('../src/');

const config = require('./config.json');
const seneca = Seneca({
  debug: {
    undead: true
  },
  log: 'silent'
});

const baseArgs = {
  role: 'inventory',
  cmd: 'add',
  params: {
    customer_id: uuid.v4(),
    prd_id: uuid.v4()
  }
};

describe('Inventory add', () => {
  before((done) => {
    seneca.use(inventory, config);
    seneca.ready(done);
  });

  it('must return error for invalid quantity', (done) => {
    seneca.act(_.assign({}, baseArgs, {
      body: {
        operation: 'add',
        quantity: 'asdas',
        unit_price: 10
      }
    }), (err) => {
      assert.ok(err);
      // Stupid error handling in seneca
      assert.equal(err.orig.orig.code, 'EBADVALUE');
      done();
    });
  });

  it('must return error for negative quantity', (done) => {
    seneca.act(_.assign({}, baseArgs, {
      body: {
        operation: 'add',
        quantity: -100,
        unit_price: 10
      }
    }), (err) => {
      assert.ok(err);
      // Stupid error handling in seneca
      assert.equal(err.orig.orig.code, 'EBADVALUE');
      done();
    });
  });

  it('must return error for invalid unit_price', (done) => {
    seneca.act(_.assign({}, baseArgs, {
      body: {
        operation: 'add',
        quantity: 100,
        unit_price: 'asd'
      }
    }), (err) => {
      assert.ok(err);
      // Stupid error handling in seneca
      assert.equal(err.orig.orig.code, 'EBADVALUE');
      done();
    });
  });

  it('must return error for negative unit_price', (done) => {
    seneca.act(_.assign({}, baseArgs, {
      body: {
        operation: 'add',
        quantity: 100,
        unit_price: -10
      }
    }), (err) => {
      assert.ok(err);
      // Stupid error handling in seneca
      assert.equal(err.orig.orig.code, 'EBADVALUE');
      done();
    });
  });

  it('must add correct log and summary entries', (done) => {
    seneca.act(_.assign({}, baseArgs, {
      body: {
        operation: 'add',
        quantity: 100,
        unit_price: 10
      }
    }), (err) => {
      assert.isNotOk(err);

      return async.parallel({
        summary: seneca.act.bind(seneca,
          _.assign({}, baseArgs, {cmd: 'summary'})),
        logs: seneca.act.bind(seneca,
          _.assign({}, baseArgs, {cmd: 'log'}))
      }, (e, result) => {
        assert.isNotOk(e);

        assert.isOk(result.summary);
        assert.lengthOf(result.summary.available, 1);
        assert.equal(result.summary.available[0].quantity, 100);
        assert.equal(result.summary.available[0].unit_price, 10);
        assert.equal(result.summary.available_quantity, 100);
        assert.equal(result.summary.available_value, 1000);
        assert.equal(result.summary.sold_quantity, 0);
        assert.equal(result.summary.sold_value, 0);
        assert.equal(result.summary.total_quantity, 100);
        assert.equal(result.summary.total_value, 1000);

        assert.isOk(result.logs);
        assert.lengthOf(result.logs, 1);
        assert.equal(result.logs[0].operation, 'add');
        assert.lengthOf(result.logs[0].records, 1);
        assert.equal(result.logs[0].records[0].quantity, 100);
        assert.equal(result.logs[0].records[0].unit_price, 10);

        done();
      });
    });
  });

  //   // TODO Refactor this test using stable circumstances
  //   // This test is not 100% accurate since the execution might be too fast
  //   // to be a concurrency problem. However, it seems to be passing.
  // it('must not allow concurrent updates', (done) => {
  //   return async.parallel([
  //     seneca.act.bind(seneca, _.assign({}, baseArgs, {
  //       body: {operation: 'add', quantity: 100, unit_price: 10}
  //     })),
  //     seneca.act.bind(seneca, _.assign({}, baseArgs, {
  //       body: {operation: 'add', quantity: 100, unit_price: 10}
  //     }))
  //   ], (err) => {
  //     assert.isOk(err);
  //     assert.equal(err.orig.orig.code, 'ELOCKED');
  //     done();
  //   });
  // });
});
