Inventory FIFO
==============

Inventory system managing resources in a FIFO method as a seneca plugin.

Abstract
--------

All inventory data is partitioned by a `customer_id` and a `prd_id` (product id). They have been defined as `uuid`'s, something that can always be changed.

Prerequisites
-------------

The plugin is using Apache Cassandra `3.x` for storing the data. To setup the necessary schema, run from the project root folder:

```
cqlsh -f schema.cql
```

Usage
-----

```
const seneca = require('seneca')();
const inventory = require('./src/inventory');

seneca.use(inventory, {
  contactPoints: ['...']
});

// Add to a product inventory
seneca.act({
  role:'inventory',
  cmd:'add',
  params: { customer_id: '...', prd_id: '...' },
  body: { quantity: 100, unit_price: 10 }
}, (err) => {});

// Rm from a product inventory
seneca.act({
  role:'inventory',
  cmd:'rm',
  params: { customer_id: '...', prd_id: '...' },
  body: { quantity: 100 }
}, (err) => {});

// Get product inventory summary
seneca.act({
  role:'inventory',
  cmd:'summary',
  params: { customer_id: '...', prd_id: '...' }
}, (err, summary) => {});

// Get product inventory activity (audit)
seneca.act({
  role:'inventory',
  cmd:'log',
  params: { customer_id: '...', prd_id: '...' }
}, (err, logs) => {});
```

Test
----

Create test schema:

```
cqlsh -f ./test/schema.sql
```

Run tests:

```
npm test
```
