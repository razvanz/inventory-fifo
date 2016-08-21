/*eslint no-sync:0*/
'use strict';

const _ = require('lodash');

const fs = require('fs');
const packageInfo = require('./package.json');

class Config {
  constructor(options) {
    if (options.configFile)
      _.assign(this, JSON.parse(fs.readFileSync(options.configFile, {
        encoding: 'utf8'
      })));

    this.title = this.title || 'Inventory API';
    this.version = packageInfo.version;
    this.description = packageInfo.description;
    this.db = this.db || {
      contactPoints: ['127.0.0.1']
    };

    this.host = options.host || this.host || '0.0.0.0';
    this.port = options.port || this.port || 3000;
    this.log = options.log || this.log || false;

    if (options.dbHosts)
      this.db.contactPoints = options.dbHosts.split(',');

    if (options.dbUsername)
      this.db.username = options.dbUsername;

    if (options.dbPassword)
      this.db.password = options.dbPassword;
  }
}

module.exports = Config;
