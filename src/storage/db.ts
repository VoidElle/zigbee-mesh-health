import Database from 'better-sqlite3';
import { ensureDataDir } from '../config';
import * as path from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = ensureDataDir();
  db = new Database(path.join(dir, 'mesh-health.db'));
  db.pragma('journal_mode = WAL');
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
  `);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
