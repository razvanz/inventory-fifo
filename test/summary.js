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
  cmd: 'summary',
  params: {
    cust_id: uuid.v4(),
    prd_id: uuid.v4()
  }
};

describe('Inventory summary', () => {
  before((done) => {
    seneca.use(inventory, config);
    seneca.ready(done);
  });

  it('must empty summary if none available', (done) => {
    seneca.act(_.assign({}, baseArgs), (err, summary) => {
      assert.isNotOk(err);

      assert.isOk(summary);
      assert.lengthOf(summary.available, 0);
      assert.equal(summary.available_quantity, 0);
      assert.equal(summary.available_value, 0);
      assert.equal(summary.rm_quantity, 0);
      assert.equal(summary.rm_value, 0);
      assert.equal(summary.total_quantity, 0);
      assert.equal(summary.total_value, 0);
      done();
    });
  });

  describe('', () => {
    before((done) => {
      return async.waterfall([
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'add',
          body: {quantity: 100, unit_price: 10}
        })),
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'rm',
          body: {quantity: 50}
        })),
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'add',
          body: {quantity: 250, unit_price: 15}
        })),
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'rm',
          body: {quantity: 225}
        })),
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'add',
          body: {quantity: 150, unit_price: 12.5}
        })),
        seneca.act.bind(seneca, _.assign({}, baseArgs, {
          cmd: 'rm',
          body: {quantity: 50}
        }))
      ], done);
    });

    it('must return correct data', (done) => {
      seneca.act(_.assign({}, baseArgs), (err, summary) => {
        assert.isNotOk(err);

        assert.isOk(summary);
        assert.lengthOf(summary.available, 2);
        assert.equal(summary.available[0].quantity, 25);
        assert.equal(summary.available[0].unit_price, 15);
        assert.equal(summary.available[1].quantity, 150);
        assert.equal(summary.available[1].unit_price, 12.5);
        assert.equal(summary.available_quantity, 175);
        assert.equal(summary.available_value, 2250);
        assert.equal(summary.rm_quantity, 325);
        assert.equal(summary.rm_value, 4375);
        assert.equal(summary.total_quantity, 500);
        assert.equal(summary.total_value, 6625);

        done();
      });
    });
  });
});
