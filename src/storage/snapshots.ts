import { getDb } from './db';

export function insertSnapshot(rawJson: string): void {
  const db = getDb();
  db.prepare('INSERT INTO network_snapshots (ts, raw_json) VALUES (?, ?)').run(
    new Date().toISOString(),
    rawJson
  );
}

export function getLatestSnapshot(): { ts: string; raw_json: string } | null {
  const db = getDb();
  const row = db
    .prepare('SELECT ts, raw_json FROM network_snapshots ORDER BY id DESC LIMIT 1')
    .get() as { ts: string; raw_json: string } | undefined;
  return row ?? null;
}
