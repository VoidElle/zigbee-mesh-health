import { getDb } from './db';
import { config } from '../config';

interface BufferedSample {
  device: string;
  ieee: string | null;
  lqi: number;
  ts: number;
}

let buffer: BufferedSample[] = [];
let timer: NodeJS.Timeout | null = null;

export function enqueueSample(device: string, ieee: string | null, lqi: number): void {
  buffer.push({ device, ieee, lqi, ts: Date.now() });
  if (buffer.length >= config.flushBatchSize) flushSamples();
}

export function flushSamples(): void {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO linkquality_samples (device_name, ieee_address, lqi, ts) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction((rows: BufferedSample[]) => {
    for (const r of rows) stmt.run(r.device, r.ieee, r.lqi, new Date(r.ts).toISOString());
  });
  tx(batch);
}

export function startBatchWriter(): void {
  if (timer) return;
  timer = setInterval(() => flushSamples(), config.flushIntervalMs);
  timer.unref();
}

export function stopBatchWriter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  flushSamples();
}

export function latestLqiPerDevice(): { name: string; ieee: string | null; lqi: number; ts: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.device_name AS name, s.ieee_address AS ieee, s.lqi AS lqi, s.ts AS ts
       FROM linkquality_samples s
       JOIN (
         SELECT device_name, MAX(id) AS max_id FROM linkquality_samples GROUP BY device_name
       ) m ON m.max_id = s.id
       ORDER BY s.device_name`
    )
    .all() as { name: string; ieee: string | null; lqi: number; ts: string }[];
}

// ponytail: raw samples table only; if a range spans beyond retention, old data
// lives in linkquality_daily_summary — union it in when daily granularity suffices.
export function history(device: string, sinceMs: number): { lqi: number; ts: string }[] {
  const db = getDb();
  const since = new Date(Date.now() - sinceMs).toISOString();
  return db
    .prepare(
      'SELECT lqi, ts FROM linkquality_samples WHERE device_name = ? AND ts >= ? ORDER BY ts ASC'
    )
    .all(device, since) as { lqi: number; ts: string }[];
}

// Mesh-wide average LQI over time, ~96 buckets across the range.
// ponytail: message-weighted average — chatty devices dominate a bucket;
// pre-average per device first if that ever skews the trend visibly.
export function meshHistory(sinceMs: number): { ts: string; lqi: number; n: number }[] {
  const db = getDb();
  const since = new Date(Date.now() - sinceMs).toISOString();
  const width = Math.max(1, Math.round(sinceMs / 96 / 1000)); // bucket size in seconds
  const rows = db
    .prepare(
      `SELECT (CAST(strftime('%s', ts) AS INTEGER) / ?) * ? AS b, AVG(lqi) AS avg, COUNT(*) AS n
       FROM linkquality_samples WHERE ts >= ? GROUP BY b ORDER BY b`
    )
    .all(width, width, since) as { b: number; avg: number; n: number }[];
  return rows.map((r) => ({
    ts: new Date(r.b * 1000).toISOString(),
    lqi: Math.round(r.avg),
    n: r.n,
  }));
}

export function listDeviceNames(): string[] {
  const db = getDb();
  return (
    db.prepare('SELECT DISTINCT device_name FROM linkquality_samples ORDER BY device_name').all() as { device_name: string }[]
  ).map((r) => r.device_name);
}
