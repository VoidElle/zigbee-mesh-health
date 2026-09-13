// Idempotent DDL bootstrap (D3): creates the five tables/indexes if missing.
//
// KEEP IN SYNC: this DDL must describe the same tables, columns, indexes and PKs
// as ../../../../prisma/schema.prisma. Index names on disk are the ones declared here
// (`idx_*`); Prisma only declares which columns are indexed. A change to one
// requires the same change to the other. We do not use Prisma Migrate in v1;
// this runs on first DB open so existing and fresh installs both work.
// Structural type: only `exec` is used, so bootstrap needs no better-sqlite3
// import (client.ts is the single owner of the driver handle).
interface Execable {
  exec(sql: string): unknown;
}

export function bootstrapSchema(db: Execable): void {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS runtime_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
