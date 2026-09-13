import type { EventRepository, SampleRepository } from '../../domain/ports';
import type { DeviceStatus, DeviceSummary } from '../../domain/entities';
import { classifyDeviceStatus, type HealthThresholds } from '../../domain/health-policy';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function createComputeDeviceHealth({
  samples,
  events,
  thresholds,
}: {
  samples: SampleRepository;
  events: EventRepository;
  thresholds: HealthThresholds;
}): { computeDeviceSummaries(): Promise<DeviceSummary[]> } {
  return {
    async computeDeviceSummaries(): Promise<DeviceSummary[]> {
      const [latestRows, names, avg24, avg7, fails] = await Promise.all([
        samples.latestLqiPerDevice(),
        samples.listDeviceNames(),
        samples.avgLqiPerDevice(DAY),
        samples.avgLqiPerDevice(7 * DAY),
        events.failureCountsPerDevice(DAY),
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
        const status: DeviceStatus = classifyDeviceStatus({ avg24h, avg7d, failures24h }, thresholds);

        summaries.push({ name, ieee, currentLqi: lqi, status, avg24h, avg7d, failures24h, lastSeen: ts || null });
      }
      return summaries.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
