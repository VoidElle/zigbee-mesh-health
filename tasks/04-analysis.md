# 04 — Analysis: moving averages + device status

**Depends on:** 01. Read `/instruction.md` §7 first.

## Goal

Turn raw LQI samples + failure events into per-device health status. Pure functions over storage queries — no timers, no side effects.

## Files

- `src/analysis/status.ts`:

```ts
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
export function computeDeviceSummaries(): DeviceSummary[];
```

## Logic (spec §7)

For each device from storage (`latestLqiPerDevice()` + `listDeviceNames()` union):
- `avg24h` — mean `lqi` over the last 24h (null if no samples).
- `avg7d` — mean over last 7 days (null if no samples).
- `failures24h` — count of `route_failure` + `delivery_failure` `log_events` for that device in the last 24h.
- Status (critical takes precedence over warning):
  - **critical**: `avg24h !== null && avg24h < config.criticalAbsolute`, **or** `failures24h > config.routeFailureCriticalCount`.
  - **warning**: `avg24h !== null && avg7d !== null && avg7d > 0 && avg24h < avg7d * (1 - config.warningThresholdPct / 100)`.
  - **ok**: otherwise.

## Acceptance criteria

- `npm run build` passes.
- Mark checkbox in `tasks/README.md`.
