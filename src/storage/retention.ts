import { getDb } from './db';
import { config } from '../config';

export function runRetentionOnce(): void {
  const db = getDb();
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const tx = db.transaction(() => {
    // Aggregate old raw samples into daily summary (recompute per device+day).
    db.prepare(
      `INSERT INTO linkquality_daily_summary (device_name, day, min_lqi, max_lqi, avg_lqi, sample_count)
       SELECT device_name,
              strftime('%Y-%m-%d', ts) AS day,
              MIN(lqi), MAX(lqi), AVG(lqi), COUNT(*)
       FROM linkquality_samples
       WHERE ts < ?
       GROUP BY device_name, day
       ON CONFLICT(device_name, day) DO UPDATE SET
         min_lqi = MIN(excluded.min_lqi, linkquality_daily_summary.min_lqi),
         max_lqi = MAX(excluded.max_lqi, linkquality_daily_summary.max_lqi),
         avg_lqi = (avg_lqi * sample_count + excluded.avg_lqi * excluded.sample_count) / (sample_count + excluded.sample_count),
         sample_count = sample_count + excluded.sample_count`
    ).run(cutoff);
    db.prepare('DELETE FROM linkquality_samples WHERE ts < ?').run(cutoff);
  });
  tx();
}

export function startRetentionJob(): void {
  runRetentionOnce();
  const t = setInterval(() => runRetentionOnce(), 24 * 60 * 60 * 1000);
  t.unref();
}
