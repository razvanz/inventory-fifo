CREATE KEYSPACE inventory
WITH durable_writes = true
AND replication = {
  'class' : 'SimpleStrategy',
  'replication_factor' : 1
};

CREATE TYPE inventory.inventory_record (
  quantity int,
  unit_price decimal
);

CREATE TABLE inventory.count (
  customer_id uuid,
  prd_id uuid,
  trx_id timeuuid,
  available LIST<FROZEN<inventory_record>>,
  available_quantity int,
  available_value decimal,
  sold_quantity int,
  sold_value decimal,
  total_quantity int,
  total_value decimal,
  PRIMARY KEY (( customer_id, prd_id ), trx_id)
) WITH CLUSTERING ORDER BY (trx_id DESC);

CREATE TABLE inventory.log (
  customer_id uuid,
  prd_id uuid,
  trx_id timeuuid,
  operation text,
  records LIST<FROZEN<inventory_record>>,
  info text,
  PRIMARY KEY (( customer_id, prd_id ), trx_id, operation)
) WITH CLUSTERING ORDER BY (trx_id DESC);

CREATE TABLE inventory.lock (
  prd_id uuid,
  customer_id uuid,
  PRIMARY KEY (prd_id, customer_id)
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
