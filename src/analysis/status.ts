import { getPrisma } from '../db/client';
import { latestLqiPerDevice, listDeviceNames } from '../db/repositories/samples';
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
  lastSeen: string | null;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function avgLqiPerDevice(sinceMs: number): Promise<Map<string, number>> {
  const rows = await getPrisma().linkQualitySample.groupBy({
    by: ['deviceName'],
    where: { ts: { gte: new Date(Date.now() - sinceMs) } },
    _avg: { lqi: true },
  });
  // AVG over typed Int is a JS number; a group only exists if it has rows, so non-null.
  return new Map(rows.map((r) => [r.deviceName, r._avg.lqi as number]));
}

async function failuresPerDevice(sinceMs: number): Promise<Map<string, number>> {
  const rows = await getPrisma().logEvent.groupBy({
    by: ['deviceName'],
    where: {
      eventType: { in: ['route_failure', 'delivery_failure'] },
      ts: { gte: new Date(Date.now() - sinceMs) },
      deviceName: { not: null },
    },
    _count: true,
  });
  // groupBy result keeps deviceName nullable despite the filter; _count is a number.
  return new Map(rows.map((r) => [r.deviceName as string, r._count]));
}

export async function computeDeviceSummaries(): Promise<DeviceSummary[]> {
  const [latestRows, names, avg24, avg7, fails] = await Promise.all([
    latestLqiPerDevice(),
    listDeviceNames(),
    avgLqiPerDevice(DAY),
    avgLqiPerDevice(7 * DAY),
    failuresPerDevice(DAY),
  ]);
  const latest = new Map(latestRows.map((r) => [r.name, r]));
  for (const name of names) {
    // ponytail: union per task contract; today both queries cover the same table,
    // so this fallback is unreachable and lqi 0 never surfaces.
    if (!latest.has(name)) latest.set(name, { name, ieee: null, lqi: 0, ts: '' });
  }

  const summaries: DeviceSummary[] = [];
  for (const { name, ieee, lqi, ts } of latest.values()) {
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

    summaries.push({ name, ieee, currentLqi: lqi, status, avg24h, avg7d, failures24h, lastSeen: ts || null });
  }
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
