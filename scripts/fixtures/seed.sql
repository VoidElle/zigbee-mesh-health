-- Representative fixture for port verification. Run with:
--   sqlite3 <db> < scripts/fixtures/seed.sql
-- Timestamps are relative to seed time so samples sit well inside the
-- 24h/7d/30d windows; a fixed 2020 block exercises retention merge.
PRAGMA journal_mode = DELETE;

CREATE TABLE IF NOT EXISTS linkquality_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  ieee_address TEXT,
  lqi INTEGER NOT NULL,
  ts DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lqi_device_ts ON linkquality_samples(device_name, ts);

CREATE TABLE IF NOT EXISTS network_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME NOT NULL,
  event_type TEXT NOT NULL,
  device_name TEXT,
  message TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON log_events(event_type, ts);

CREATE TABLE IF NOT EXISTS linkquality_daily_summary (
  device_name TEXT NOT NULL,
  day TEXT NOT NULL,
  min_lqi INTEGER,
  max_lqi INTEGER,
  avg_lqi REAL,
  sample_count INTEGER,
  PRIMARY KEY (device_name, day)
);

-- LQI samples: Luce
INSERT INTO linkquality_samples (device_name, ieee_address, lqi, ts) VALUES
  ('Luce','0x00158d0001a2b3c4',120,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hours')),
  ('Luce','0x00158d0001a2b3c4',118,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hours')),
  ('Luce','0x00158d0001a2b3c4',125,strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 hours')),
  ('Luce','0x00158d0001a2b3c4',130,strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 hours')),
  ('Luce','0x00158d0001a2b3c4',128,strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 hours')),
  ('Luce','0x00158d0001a2b3c4',140,strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours')),
  ('Luce','0x00158d0001a2b3c4',150,strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')),
  ('Luce','0x00158d0001a2b3c4',155,strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days')),
  ('Luce','0x00158d0001a2b3c4',160,strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 days')),
  ('Luce','0x00158d0001a2b3c4',158,strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 days')),
  ('Luce','0x00158d0001a2b3c4',165,strftime('%Y-%m-%dT%H:%M:%fZ','now','-29 days')),
-- Sensore
  ('Sensore','0x00158d0001a2b3c5',80,strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 minutes')),
  ('Sensore','0x00158d0001a2b3c5',85,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 hours')),
  ('Sensore','0x00158d0001a2b3c5',90,strftime('%Y-%m-%dT%H:%M:%fZ','now','-23 hours')),
  ('Sensore','0x00158d0001a2b3c5',95,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
  ('Sensore','0x00158d0001a2b3c5',100,strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days')),
  ('Sensore','0x00158d0001a2b3c5',105,strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 days')),
  ('Sensore','0x00158d0001a2b3c5',110,strftime('%Y-%m-%dT%H:%M:%fZ','now','-28 days')),
-- Plug
  ('Plug','0x00158d0001a2b3c6',200,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hours')),
  ('Plug','0x00158d0001a2b3c6',210,strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 hours')),
  ('Plug','0x00158d0001a2b3c6',205,strftime('%Y-%m-%dT%H:%M:%fZ','now','-26 hours')),
  ('Plug','0x00158d0001a2b3c6',215,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days')),
  ('Plug','0x00158d0001a2b3c6',220,strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 days')),
  ('Plug','0x00158d0001a2b3c6',225,strftime('%Y-%m-%dT%H:%M:%fZ','now','-29 days')),
-- Retention block: fixed 2020 rows + a pre-existing same-day summary
  ('OldDev','0x00ffff',40,'2020-01-05T10:00:00.000Z'),
  ('OldDev','0x00ffff',60,'2020-01-05T14:00:00.000Z'),
  ('OldDev','0x00ffff',50,'2020-01-05T18:00:00.000Z');

INSERT INTO linkquality_daily_summary (device_name, day, min_lqi, max_lqi, avg_lqi, sample_count) VALUES
  ('OldDev','2020-01-05',5,30,20.0,3);

-- Events: every type, device + bridge, inside and outside 24h
INSERT INTO log_events (ts, event_type, device_name, message) VALUES
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hours'),'route_failure','Plug','no network route'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 hours'),'route_failure','Plug','Failed to route message'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-23 hours'),'route_failure','Plug','no network route'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 hours'),'route_failure','Luce','no network route'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 hours'),'delivery_failure','Sensore','Failed to publish MQTT message'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 hours'),'delivery_failure','Luce','Failed to publish MQTT message'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 hours'),'device_leave','Luce','Device ''Luce'' left the network'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-26 hours'),'device_leave','Sensore','Device ''Sensore'' left the network'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 hours'),'bridge_restart',NULL,'Starting Zigbee2MQTT'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 hours'),'version_change',NULL,'z2m 1.40.0 -> 1.41.0'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hours'),'state_change','Luce','state: ON -> OFF'),
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 hours'),'other','0x0015bc001b10033c','device_joined');

-- Network snapshot (latest)
INSERT INTO network_snapshots (ts, raw_json) VALUES
  (strftime('%Y-%m-%dT%H:%M:%fZ','now','-45 minutes'),
   '{"status":"ok","data":{"type":"raw","value":{"nodes":[{"ieeeAddr":"0x00158d0001a2b3c4","type":"EndDevice"},{"ieeeAddr":"0x00124b0000000001","type":"Coordinator"}],"links":[{"source":"0x00124b0000000001","target":"0x00158d0001a2b3c4","lqi":120}]}}}');
