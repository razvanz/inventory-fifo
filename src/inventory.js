'use strict';

const _ = require('lodash');
const async = require('async');

const db = require('./inventory-db');
const InventoryError = require('./InventoryError');

class Inventory {

  // RETRIEVE SUMMARY
  static summary(args, cb) {
    return async.waterfall([
      async.constant(args),
      async.ensureAsync(Inventory.getQueryObj),
      db.getSummary
    ], (err, result) => {
      if (err)
        return cb(err);

      return cb(null, _.assign(
        Inventory.EMPTY_SUMMARY,
        args.params,
        result.rows[0],
        {date: result.rows[0] ? result.rows[0].trx_id.getDate() : new Date()}
      ));
    });
  }

  // ADD TO INVENTORY
  static addRecord(args, cb) {
    return async.waterfall([
      async.ensureAsync(Inventory.validateOpParams.bind(null, args)),
      Inventory.lock.bind(null, {params: args.params}),
      Inventory.summary.bind(null, {params: args.params}),
      (summary, done) => {
        // Create summary update
        const summaryData = _.assign({}, summary);
        summaryData.total_quantity += args.body.quantity;
        summaryData.total_value += args.body.quantity * args.body.unit_price;
        summaryData.available.push({
          quantity: args.body.quantity,
          unit_price: args.body.unit_price
        });
        summaryData.available_quantity += args.body.quantity;
        summaryData.available_value +=
          args.body.quantity * args.body.unit_price;

        // Create log entry
        const logData = {
          cust_id: summary.cust_id,
          prd_id: summary.prd_id,
          operation: 'add',
          records: [{
            quantity: args.body.quantity,
            unit_price: args.body.unit_price
          }]
        };

        return db.updateInventory({
          summary: summaryData,
          log: logData
        }, done);
      }
    ], Inventory.wrapUnlock(args, cb));
  }

  // REMOVE FROM INVENTORY
  static rmRecord(args, cb) {
    return async.waterfall([
      async.ensureAsync(Inventory.validateOpParams.bind(null, args)),
      Inventory.lock.bind(null, {params: args.params}),
      Inventory.summary.bind(null, {params: args.params}),
      (summary, done) => {
        // Make sure there are enough items to remove from
        if (summary.available_quantity < args.body.quantity)
          return cb(new InventoryError('ENOTAVAILABLE'));

        // Create summary update
        const rmRecords = [];
        const summaryData = _.assign({}, summary);
        // Remove from available using FIFO method
        while (args.body.quantity > 0) {
          const entry = summaryData.available.splice(0, 1)[0];

          if (args.body.quantity < entry.quantity) {
            rmRecords.push({
              quantity: args.body.quantity,
              unit_price: entry.unit_price
            });

            summaryData.rm_quantity += args.body.quantity;
            summaryData.rm_value += args.body.quantity * entry.unit_price;
            summaryData.available_quantity -= args.body.quantity;
            summaryData.available_value -=
              args.body.quantity * entry.unit_price;

            entry.quantity -= args.body.quantity;
            summaryData.available.unshift(entry);
            args.body.quantity = 0;
          } else {
            rmRecords.push({
              quantity: entry.quantity,
              unit_price: entry.unit_price
            });

            summaryData.available_quantity -= entry.quantity;
            summaryData.rm_quantity += entry.quantity;
            summaryData.available_value -= entry.quantity * entry.unit_price;
            summaryData.rm_value += entry.quantity * entry.unit_price;

            args.body.quantity -= entry.quantity;
          }
        }

        // Create log entry
        const logData = {
          cust_id: args.params.cust_id,
          prd_id: args.params.prd_id,
          operation: 'rm',
          records: rmRecords
        };

        return db.updateInventory({
          summary: summaryData,
          log: logData
        }, done);
      }
    ], Inventory.wrapUnlock(args, cb));
  }

  // List movemens
  static listLogs(args, cb) {
    return async.waterfall([
      async.constant(args),
      async.ensureAsync(Inventory.getQueryObj),
      db.getLogs
    ], (err, result) => {
      if (err)
        return cb(err);

      return cb(null, result.rows);
    });
  }

  /****************************************************************************
   * HELPER METHODS
   ***************************************************************************/

  static getQueryObj(args, cb) {
    const query = _.assign({}, args.params);

    // Filter by date if date query parameter passed
    if (args.query && args.query.date) {
      const dateObj = new Date(args.query.date);
      /*eslint eqeqeq:0*/
      if (dateObj != 'Invalid Date')
        query.date = dateObj;
      else
        return cb(
          new InventoryError('EBADVALUE', [args.query.date, 'date'])
        );
    }

    return cb(null, query);
  }

  static validateOpParams(args, cb) {
    if (isNaN(args.body.quantity) || !isFinite(args.body.quantity) ||
      (args.body.quantity % 1 !== 0) || args.body.quantity <= 0)
      return cb(
        new InventoryError('EBADVALUE', [args.body.quantity, 'quantity'])
      );

    // Ignore unit price for rm operations.
    if (args.cmd === 'rm')
      return cb(null);

    if (isNaN(args.body.unit_price) || !isFinite(args.body.unit_price) ||
      args.body.unit_price < 0)
      return cb(
        new InventoryError('EBADVALUE', [args.body.unit_price, 'unit_price'])
      );

    return cb(null);
  }

  static lock(args, cb) {
    return db.aquireLock(args.params, (err, result) => {
      if (err)
        return cb(err);

      if (!result.rows.length)
        return cb(new InventoryError('EINTERNAL'));

      if (!result.rows[0]['[applied]'])
        return cb(new InventoryError('ELOCKED'));

      return cb(null);
    });
  }

  static unlock(args, cb) {
    return db.releaseLock(args.params, (err) => {
      if (err)
        return cb(err);

      return cb(null);
    });
  }

  static wrapUnlock(args, cb) {
    return (err) => {
      // Return if it failed before locking
      if (err && (err.code === 'ELOCKED' || err.code === 'EBADVALUE'))
        return cb(err);

      // TODO Even if unlockErr it's something that can be ignored since the
      // lock will timeout in configured time, would be nice to log the error
      // somewhere.
      return Inventory.unlock(args, (unlockErr) => {
        /*eslint no-unused-vars:0*/
        // if (unlockErr)
        //   console.log(unlockErr);

        // Return previous potential error
        return cb(err);
      });
    };
  }

  /****************************************************************************
   * SENECA INTEGRATION
   ***************************************************************************/

  static get PLUGIN_CONFIG() {
    return {
      name: 'inventory'
    };
  }

  static plugin(config) {
    this.add('init:inventory', (payload, cb) => {
      return db.connect(config.db, cb);
    });

    this.add({role: 'inventory', cmd: 'add'}, Inventory.addRecord);
    this.add({role: 'inventory', cmd: 'rm'}, Inventory.rmRecord);
    this.add({role: 'inventory', cmd: 'summary'}, Inventory.summary);
    this.add({role: 'inventory', cmd: 'log'}, Inventory.listLogs);

    return Inventory.PLUGIN_CONFIG;
  }

  /****************************************************************************
   * CONSTANTS
   ***************************************************************************/

  static get EMPTY_SUMMARY() {
    return {
      available: [],
      available_quantity: 0,
      available_value: 0,
      rm_quantity: 0,
      rm_value: 0,
      total_quantity: 0,
      total_value: 0
    };
  }
}

module.exports = Inventory;
