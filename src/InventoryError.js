'use strict';

const util = require('util');

class InventoryError extends Error {
  constructor(code, args) {
    if (!code || !(code in InventoryError.ERRORS))
      code = 'EINTERNAL';

    args = args || [];
    const message = util.format.apply(util,
      [InventoryError.ERRORS[code]].concat(args));

    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.raw_args = args;
    this.raw_message = InventoryError.ERRORS[code];
  }

  toJson() {
    return JSON.stringify({
      code: this.code,
      message: this.message,
      name: this.name,
      stack: this.stack,
      raw_args: this.raw_args,
      raw_message: this.raw_message
    });
  }

  static get ERRORS() {
    return {
      EBADVALUE: 'Invalid value "%j" for field %s',
      ELOCKED: 'Inventory for product is currently locked',
      ENOTAVAILABLE: 'Unable to remove more items than available',
      EINTERNAL: 'Internal server error'
    };
  }
}

module.exports = InventoryError;
