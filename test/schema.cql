CREATE KEYSPACE inventory_test
WITH durable_writes = true
AND replication = {
  'class' : 'SimpleStrategy',
  'replication_factor' : 1
};

CREATE TYPE inventory_test.inventory_record (
  quantity int,
  unit_price decimal
);

CREATE TABLE inventory_test.summary (
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

CREATE TABLE inventory_test.log (
  cust_id uuid,
  prd_id uuid,
  trx_id timeuuid,
  operation text,
  records LIST<FROZEN<inventory_record>>,
  PRIMARY KEY (( cust_id, prd_id ), trx_id)
) WITH CLUSTERING ORDER BY (trx_id DESC);

CREATE TABLE inventory_test.lock (
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
