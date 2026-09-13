# Task 01 — Domain layer

**Depends on:** nothing.
**Touches:** adds `src/domain/*` only. No existing file changes.

## Goal

Create the pure domain layer: types, ports and business rules with zero
dependencies. Purely additive; build stays green and behavior unchanged.

## Files to create

### `src/domain/entities.ts`

Move/define the shared types currently scattered across old modules. Names must
match the current public types so shims line up later.

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
  lastSeen: string | null;
}

export type EventType =
  | 'route_failure' | 'delivery_failure' | 'device_leave'
  | 'bridge_restart' | 'version_change' | 'state_change' | 'other';

export interface EventRow {
  id: number;
  ts: string;
  event_type: EventType;
  device_name: string | null;
  message: string | null;
}

export interface LinkQualitySample {
  device: string;
  ieee: string | null;
  lqi: number;
  ts: number;            // epoch ms, as buffered today
}

export interface LinkQualityPoint { lqi: number; ts: string }
export interface LatestLinkQuality { name: string; ieee: string | null; lqi: number; ts: string }
export interface MeshBucket { ts: string; lqi: number; n: number }
export interface NetworkSnapshotRecord { ts: string; raw_json: string }
export interface RuntimeStatusSnapshot {
  mqttConnected: boolean;
  lastSampleAt: Date | null;
  lastSnapshotAt: Date | null;
}
export type MeshScanResult = { ok: boolean; error?: string };
export type ManualRefreshResult = { ok: boolean; error?: string; promise?: Promise<MeshScanResult> };
```

### `src/domain/ports.ts`

Interfaces only. No imports beyond `./entities`.

```ts
import type {
  EventRow, EventType, LatestLinkQuality, LinkQualityPoint, LinkQualitySample,
  MeshBucket, MeshScanResult, NetworkSnapshotRecord, RuntimeStatusSnapshot,
} from './entities';

export interface SampleRepository {
  saveBatch(samples: LinkQualitySample[]): Promise<void>;
  history(device: string, sinceMs: number): Promise<LinkQualityPoint[]>;
  meshHistory(sinceMs: number): Promise<MeshBucket[]>;
  listDeviceNames(): Promise<string[]>;
  latestLqiPerDevice(): Promise<LatestLinkQuality[]>;
}

export interface EventRepository {
  insert(type: EventType, device: string | null, message: string): Promise<void>;
  list(opts?: { type?: EventType; sinceMs?: number; limit?: number }): Promise<EventRow[]>;
}

export interface SnapshotRepository {
  insert(rawJson: string): Promise<void>;
  latest(): Promise<NetworkSnapshotRecord | null>;
}

export interface AliasRepository {
  getAll(): Promise<Map<string, string>>;
  set(name: string, alias: string | null): Promise<void>;
}

export interface RuntimeStateRepository {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export interface EventBus {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  emit(event: string): void;
}

export interface Clock { now(): number }

export interface RuntimeStatusStore {
  snapshot(): RuntimeStatusSnapshot;
  setMqttConnected(v: boolean): void;
  markSampleAt(d: Date): void;
  markSnapshotAt(d: Date): void;
}

export interface MeshScanner {
  request(forceManual?: boolean): Promise<MeshScanResult>;
  triggerManualRefresh(): ManualRefreshResult;
  startScheduler(): void;
}
```

### `src/domain/health-policy.ts`

Pure function extracted from `src/analysis/status.ts:66-79`. No config import;
thresholds are arguments.

```ts
import type { DeviceStatus } from './entities';

export interface HealthThresholds {
  criticalAbsolute: number;
  warningThresholdPct: number;
  routeFailureCriticalCount: number;
}

export function classifyDeviceStatus(
  input: { avg24h: number | null; avg7d: number | null; failures24h: number },
  t: HealthThresholds,
): DeviceStatus
```

Copy the exact branch order and comparisons from `src/analysis/status.ts:66-79`.

### `src/domain/event-classification.ts`

Move `classifyLogging` (`src/mqtt/eventCollector.ts:40-58`) and
`extractDeviceName` (`:62-67`) verbatim, including the ordered regex list and
comments. Exports: `classifyLogging(message: string, level: string): EventType`,
`extractDeviceName(message: string): string | null`.

## Steps

1. Create the four files above.
2. Do NOT modify `src/analysis/status.ts` or `src/mqtt/eventCollector.ts` yet —
   later tasks point them at these implementations.
3. `npm run build`.

## Verify

- `npm run build` exits 0.
- `npm test` still green (nothing changed behaviorally).

## Done when

`src/domain/` exists with the four files and the build passes.
