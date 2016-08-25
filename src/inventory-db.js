'use strict';

const _ = require('lodash');
const driver = require('cassandra-driver');
const Client = driver.Client;

let client = null;

class InventoryDB {
  connect(config, cb) {
    client = new Client(config);
    return client.connect(cb);
  }

  disconnect(cb) {
    return client.shutdown(cb);
  }

  aquireLock(queryObj, cb) {
    return client.execute(InventoryDB.QUERIES.AQUIRE_LOCK, [
      queryObj.customer_id,
      queryObj.prd_id
    ], {prepare: true}, cb);
  }

  releaseLock(queryObj, cb) {
    return client.execute(InventoryDB.QUERIES.RELEASE_LOCK, [
      queryObj.customer_id,
      queryObj.prd_id
    ], {prepare: true}, cb);
  }

  getSummary(queryObj, cb) {
    if (queryObj.date)
      return client.execute(InventoryDB.QUERIES.GET_SUMMARY_BY_DATE, [
        queryObj.customer_id,
        queryObj.prd_id,
        queryObj.date
      ], {prepare: true}, InventoryDB.wrapDecodeSummary(cb));

    return client.execute(InventoryDB.QUERIES.GET_SUMMARY, [
      queryObj.customer_id,
      queryObj.prd_id
    ], {prepare: true}, InventoryDB.wrapDecodeSummary(cb));
  }

  getLogs(queryObj, cb) {
    if (queryObj.date)
      return client.execute(InventoryDB.QUERIES.GET_LOG_BY_DATE, [
        queryObj.customer_id,
        queryObj.prd_id,
        queryObj.date
      ], {prepare: true}, InventoryDB.wrapDecodeLog(cb));

    return client.execute(InventoryDB.QUERIES.GET_LOG, [
      queryObj.customer_id,
      queryObj.prd_id
    ], {prepare: true}, InventoryDB.wrapDecodeLog(cb));
  }

  updateInventory(data, cb) {
    return client.batch([{
      query: InventoryDB.QUERIES.INSERT_SUMMARY_UPDATE,
      params: [
        data.summary.customer_id,
        data.summary.prd_id,
        data.summary.available,
        data.summary.available_quantity,
        data.summary.available_value,
        data.summary.sold_quantity,
        data.summary.sold_value,
        data.summary.total_quantity,
        data.summary.total_value
      ]
    }, {
      query: InventoryDB.QUERIES.INSERT_LOG,
      params: [
        data.log.customer_id,
        data.log.prd_id,
        data.log.operation,
        data.log.records,
        data.log.info
      ]
    }], {prepare: true}, cb);
  }

  /****************************************************************************
   * HELPER METHODS
   ***************************************************************************/

  static wrapDecodeSummary(cb) {
    return function (err, result) {
      if (err)
        return cb(err);

      result.rows = _.map(result.rows, (row) => {
        row.available = _.map(row.available, (avail) => {
          avail.unit_price = InventoryDB.getNumber(avail.unit_price);
          return avail;
        });

        row.available_value = InventoryDB.getNumber(row.available_value);
        row.sold_value = InventoryDB.getNumber(row.sold_value);
        row.total_value = InventoryDB.getNumber(row.total_value);
        return row;
      });

      return cb(null, result);
    };
  }

  static wrapDecodeLog(cb) {
    return function (err, result) {
      if (err)
        return cb(err);

      result.rows = _.map(result.rows, (row) => {
        row.records = _.map(row.records, (record) => {
          record.unit_price = InventoryDB.getNumber(record.unit_price);
          return record;
        });

        return row;
      });

      return cb(null, result);
    };
  }

  static getNumber(bigDecimal) {
    return bigDecimal ? bigDecimal.toNumber() : 0;
  }

  /****************************************************************************
   * CONSTANTS
   ***************************************************************************/

  static get QUERIES() {
    /*eslint max-len:0*/
    return {
      // Locking
      AQUIRE_LOCK: 'INSERT INTO lock(customer_id, prd_id) VALUES (?,?) IF NOT EXISTS;',
      RELEASE_LOCK: 'DELETE FROM lock WHERE customer_id=? AND prd_id=?;',
      // Retrieve inventory summary
      GET_SUMMARY: `SELECT * FROM count
        WHERE customer_id=? AND prd_id=?
        ORDER BY trx_id DESC
        LIMIT 1;`,
      GET_SUMMARY_BY_DATE: `SELECT * FROM count
        WHERE customer_id=? AND prd_id=? AND trx_id<maxTimeuuid(?)
        ORDER BY trx_id DESC
        LIMIT 1;`,
      // Retrieve transaction logs
      GET_LOG: `SELECT * FROM log
        WHERE customer_id=? AND prd_id=?
        ORDER BY trx_id DESC;`,
      GET_LOG_BY_DATE: `SELECT * FROM log
        WHERE customer_id=? AND prd_id=? AND trx_id<maxTimeuuid(?)
        ORDER BY trx_id DESC;`,
      // Update inventory
      INSERT_SUMMARY_UPDATE: `INSERT into count(customer_id, prd_id, trx_id,
          available, available_quantity, available_value, sold_quantity,
          sold_value, total_quantity, total_value) VALUES (?,?,now(),?,?,?,?,?,?,?);`,
      INSERT_LOG: `INSERT into log(customer_id, prd_id, trx_id, operation, records, info)
          VALUES (?,?,now(),?,?,?);`
    };
  }
}

module.exports = new InventoryDB;
