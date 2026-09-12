import { getDb } from '../storage/db';
import { latestLqiPerDevice, listDeviceNames } from '../storage/samples';
import { config } from '../config';

export type DeviceStatus = 'ok' | 'warning' | 'critical';

export interface DeviceSummary {
  name: string;
  ieee: string | null;
  currentLqi: number;
  status: DeviceStatus;
  avg24h: number | null;
  avg7d: number | null;
  failures24h: number;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function avgLqiPerDevice(sinceMs: number): Map<string, number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const rows = getDb()
    .prepare(
      'SELECT device_name, AVG(lqi) AS avg FROM linkquality_samples WHERE ts >= ? GROUP BY device_name'
    )
    .all(since) as { device_name: string; avg: number }[];
  return new Map(rows.map((r) => [r.device_name, r.avg]));
}

function failuresPerDevice(sinceMs: number): Map<string, number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT device_name, COUNT(*) AS n FROM log_events
       WHERE event_type IN ('route_failure', 'delivery_failure')
         AND ts >= ? AND device_name IS NOT NULL
       GROUP BY device_name`
    )
    .all(since) as { device_name: string; n: number }[];
  return new Map(rows.map((r) => [r.device_name, r.n]));
}

export function computeDeviceSummaries(): DeviceSummary[] {
  const latest = new Map(latestLqiPerDevice().map((r) => [r.name, r]));
  for (const name of listDeviceNames()) {
    // ponytail: union per task contract; today both queries cover the same table,
    // so this fallback is unreachable and lqi 0 never surfaces.
    if (!latest.has(name)) latest.set(name, { name, ieee: null, lqi: 0, ts: '' });
  }

  const avg24 = avgLqiPerDevice(DAY);
  const avg7 = avgLqiPerDevice(7 * DAY);
  const fails = failuresPerDevice(DAY);

  const summaries: DeviceSummary[] = [];
  for (const { name, ieee, lqi } of latest.values()) {
    const avg24h = avg24.get(name) ?? null;
    const avg7d = avg7.get(name) ?? null;
    const failures24h = fails.get(name) ?? 0;

    let status: DeviceStatus = 'ok';
    if (
      (avg24h !== null && avg24h < config.criticalAbsolute) ||
      failures24h > config.routeFailureCriticalCount
    ) {
      status = 'critical';
    } else if (
      avg24h !== null &&
      avg7d !== null &&
      avg7d > 0 &&
      avg24h < avg7d * (1 - config.warningThresholdPct / 100)
    ) {
      status = 'warning';
    }

    summaries.push({ name, ieee, currentLqi: lqi, status, avg24h, avg7d, failures24h });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
