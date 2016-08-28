Introduction
------------

As a inventory system, the program must record changes in the quantity and value of products. Being governed by the FIFO method, removal the products must be done in the order they have been introduced.

Approach
--------

With a model that allows isolation, the system can be build as an independent application (service), capable of being deployed and managed on it's own. At the same time, this allows horizontal scaling with multiple instances of the applications serving requests in parallel. Following this approach means that there the should be no state between requests. Furthermore, parallel requests hitting the same inventory, could cause concurrency issues, which can be solved with a scalable locking mechanism.

Abstract
--------

It's been assumed that all inventory data is partitioned by a `cust_id` and a `prd_id` (product id). They have been defined as `uuid` type, something that can always be changed.

Solution
--------

For attempting a solution, the first step is to identify the requirements. Having previously described that the inventory will need to use the FIFO method, the next step is to define the interface which will allow client applications to communicate with the system. From the requirements it seems that the inventory will need to serve 4 requests:

-	adding products to the inventory
-	removing products from the inventory
-	getting the status (summary) of the inventory
-	listing all transactions for an inventory<sup>1</sup>

While adding of products doesn't require prior knowledge about the inventory status, removing products needs it for making sure that not more than available products can be removed. Along with the actual operation of serving the summary to clients, querying for it will be a "hot" operation. Taking into account that there could be potentially many operations for a product, having to calculate the status by going through all entries will be a performance bottleneck. Instead, a better idea is to maintain a calculated version of the status which get's updated every time an add or a remove operation occurs. This will not eliminate its "hotness", furthermore it will make it required for the add operation as well, but it should increase the overall speed by cutting down the time needed for its processing.

Storage
-------

With all this in mind, the next step is to define the schema. Apache Cassandra seemed like a good choice for storing the data because its distributed architecture allows horizontal scaling (avoiding DB bottleneck) and it enables creation of a distributed locking system.

#### Summary (Inventory status)

As previously mentioned, the inventory status will be stored as always up to date entries, which contain all the information all the information required for managing the inventory. The entries will be partitioned by `cust_id` + `prd_id`, with each entry being uniquely identified by a `trx_id` (transaction id). The field will be of a `timeuuid` type, with it's randomness ensuring uniqueness and the encoded timestamp enabling querying for entries by date (retrieving summary at a point in time). Additionally, an entry will contain:

-	`available`: list of available units in the inventory along with the associated unit price
-	`available_quantity`: count of all available units
-	`available_value`: calculated value of all available units
-	`rm_quantity`: count of all removed units
-	`rm_value`: calculated value of all removed units
-	`total_quantity`: count of all units that have ever been in the inventory
-	`total_value`: calculated value of all units that have ever been in the inventory

The schema for the `summary` table:

```
CREATE TABLE inventory.summary (
  cust_id uuid,
  prd_id uuid,
  trx_id timeuuid,
  available LIST<FROZEN<inventory_record>>,
  available_quantity int,
  available_value decimal,
  rm_quantity int,
  rm_value decimal,
  total_quantity int,
  total_value decimal,
  PRIMARY KEY (( cust_id, prd_id ), trx_id)
) WITH CLUSTERING ORDER BY (trx_id DESC);
```

*Note: Entries will be sorted on the disk by `trx_id` (therefore by their date) in descending order, which will optimize the retrieval.*

#### Logs (Inventory actions)

To satisfy the optional requirement of listing all inventory actions, another table is needed. Just as the summary, the entries will be partitioned by `cust_id` + `prd_id` and then be uniquely identified by the same `trx_id` used to identify the summary update. Other columns:

-	`operation`: type of the action executed (`add` / `rm`\)
-	`records`: list of units which have been added or removed along with their associated unit price

The schema for the `log` table:

```
CREATE TABLE inventory.log (
  cust_id uuid,
  prd_id uuid,
  trx_id timeuuid,
  operation text,
  records LIST<FROZEN<inventory_record>>,
  PRIMARY KEY (( cust_id, prd_id ), trx_id)
) WITH CLUSTERING ORDER BY (trx_id DESC);
```

*Note: A list was required to store the added or removed records because removal is done based on the available units, which could have a different unit price.*

#### Locking

The locking mechanism relies on Cassandra's [Lightweight Transactions (LWT)](http://www.planetcassandra.org/blog/lightweight-transactions-in-cassandra-20/), which allow insertion of a row only if it does not already exist. Since only 1, stateless, operation (`INSERT ... IF NOT EXISTS`) will be required for acquiring a lock, it's a reliable solution which will not present concurrency issues. Locks will have to timeout after a certain amount of time in order to avoid deadlocks. Expiry relies on Cassandra's [Time To Live (TTL)](http://docs.datastax.com/en/cql/3.3/cql/cql_using/useExpire.html?hl=ttl) feature, which deletes<sup>2</sup> expired rows. Lastly, the schema for the table in which the locks will be stored:

```
CREATE TABLE inventory.lock (
  prd_id uuid,
  cust_id uuid,
  PRIMARY KEY (prd_id, cust_id)
) WITH default_time_to_live = 60
AND gc_grace_seconds = 86400
AND memtable_flush_period_in_ms = 60000
AND caching = {
  'keys' : 'ALL',
  'rows_per_partition' : 'ALL'
}
AND compaction = {
  'class' : 'DateTieredCompactionStrategy'
};
```

*Notes:*

-	*`prd_id` is used as partition key instead of `cust_id` in order to better distribute the data. This will optimize the LWT's<sup>3</sup> since the amount of filtering will be reduced, as well as eliminate possible hotspots caused by "active" clients.*
-	*Default TTL of a lock will be 60 seconds.*
-	*The data will mostly be kept in memory since the writing to disk will occur once a minute.*

Implementation
--------------

Once the schema was in place the next step is to write some code which will serve the inventory requests. For convenience reasons, the functionality is provided as a [seneca](senecajs.org) plugin. Without going into details, seneca is a framework which provides a layer of abstraction for service communication and logic encapsulation.

The requests implementation is quite straightforward, with the the only things worth mentioning:

-	When asking for the status of an inventory which has no entries, the system returns an empty summary. It's intend is avoiding "leakage" of business logic outside the service.
-	Locks are released even no matter what is the the outcome of the add / remove operations (except a locking error). Even if locks expire, releasing them enables the clients to retry right away, without having to wait for the timeout.
-	Errors are not being logged. A nice add-on to the application would be logging of errors.

As also presented in the README, the system interface is:

```
// Add to inventory
seneca.act({
  role:'inventory',
  cmd:'add',
  params: { cust_id: '...', prd_id: '...' },
  body: { quantity: 100, unit_price: 10 }
}, (err) => {});

// Rm from inventory
seneca.act({
  role:'inventory',
  cmd:'rm',
  params: { cust_id: '...', prd_id: '...' },
  body: { quantity: 100 }
}, (err) => {});

// Get inventory summary
seneca.act({
  role:'inventory',
  cmd:'summary',
  params: { cust_id: '...', prd_id: '...' }
}, (err, summary) => {});

// Get inventory activity (audit)
seneca.act({
  role:'inventory',
  cmd:'log',
  params: { cust_id: '...', prd_id: '...' }
}, (err, logs) => {});
```

Additionally, the functionality can be provided through an HTTP server. A ExpressJS server, which can be started by running `npm start` from the project's root directory, exposes the same functionality through the following HTTP API:

```
// Add / remove from inventory
PUT /customer/:cust_id/product/:prd_id
  body:
  {
    operation: 'add', // 'rm' for removal
    quantity: 100,
    unit_price 10
  }

// Retrieve inventory status
GET /customer/:cust_id/product/:prd_id/summary

// Retrieve inventory logs
GET /customer/:cust_id/product/:prd_id/log
```

Footnotes
---------

<sup>1</sup> Optional but nice to have request. While not directly a requirement, it could be later used for debugging or analytic purposes.

<sup>2</sup> Expired rows are deleted from disk only when Cassandra does it's compaction. Nevertheless, until deleted, they are ignored when queries are executed.

<sup>3</sup> Lightweight transactions block each other within a single partition. Transactions in different partitions will never interrupt each other.
