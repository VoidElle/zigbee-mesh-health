import type { DeviceStatus } from './entities';

export interface HealthThresholds {
  criticalAbsolute: number;
  warningThresholdPct: number;
  routeFailureCriticalCount: number;
}

export function classifyDeviceStatus(
  input: { avg24h: number | null; avg7d: number | null; failures24h: number },
  t: HealthThresholds,
): DeviceStatus {
  const { avg24h, avg7d, failures24h } = input;
  if (
    (avg24h !== null && avg24h < t.criticalAbsolute) ||
    failures24h > t.routeFailureCriticalCount
  ) {
    return 'critical';
  }
  if (
    avg24h !== null &&
    avg7d !== null &&
    avg7d > 0 &&
    avg24h < avg7d * (1 - t.warningThresholdPct / 100)
  ) {
    return 'warning';
  }
  return 'ok';
}
