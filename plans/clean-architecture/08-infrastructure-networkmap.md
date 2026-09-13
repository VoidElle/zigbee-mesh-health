# Task 08 — Infrastructure: network map scanner + scheduler

**Depends on:** task 07.
**Touches:** `infrastructure/networkmap/MqttMeshScanner.ts`,
`infrastructure/networkmap/NetworkMapScheduler.ts`,
`infrastructure/scheduler/CronScheduler.ts`; shim for `src/networkmap/index.ts`.

## Goal

Isolate the active-scan MQTT request/response logic and the cron scheduling into
infrastructure adapters behind the `MeshScanner` port. **The SPEC §2 hard
constraint must be preserved verbatim**: this remains the only module allowed to
publish `bridge/request/networkmap`, max 1–2/day, manual rate limit 1h, no
immediate retry on timeout.

## Files to create

### `src/infrastructure/networkmap/MqttMeshScanner.ts`

Move `src/networkmap/index.ts:12-111` (everything except scheduling). Implements
`MeshScanner`.

- Keep `requestTopic`, `responseTopic`, `MANUAL_RATE_LIMIT_MS`.
- Keep `ensureSubscribed`, `doRequest`, module-level `inFlight`/`lastManualAt`/
  `pendingResolve` state, timeout via `networkmapTimeoutMs`.
- Snapshot persistence goes through `SnapshotRepository.insert` instead of the
  old `insertSnapshot`; mark snapshot time via
  `RuntimeStatusStore.markSnapshotAt`.
- Keep all logs identical: `[networkmap] timeout...`,
  `[networkmap] bridge error: ...`, `[networkmap] snapshot saved`,
  `[networkmap] active scan requested (rare by design, spec §2)`.
- Keep the top-of-file SPEC §2 warning comment.
- `request(forceManual?)` and `triggerManualRefresh()` keep exact result shapes
  and rate-limit/in-flight semantics.

```ts
export function createMqttMeshScanner(deps: {
  client: MqttClient;
  snapshots: SnapshotRepository;
  runtime: RuntimeStatusStore;
  baseTopic: string;
  timeoutMs: number;
}): MeshScanner
```

### `src/infrastructure/networkmap/NetworkMapScheduler.ts`

Move `parseScheduleToCron` (`src/networkmap/index.ts:102-111`) + scheduling. Keep
the invalid-schedule warning text and `04:00` fallback. Scheduler guard against
double start.

```ts
export function createNetworkMapScheduler(deps: {
  scanner: MeshScanner;
  schedule: string;
  cron: CronScheduler;
}): { start(): void }
```

### `src/infrastructure/scheduler/CronScheduler.ts`

Thin wrapper over `node-cron` so application/infrastructure can be tested and so
`node-cron` is imported in exactly one place:

```ts
import type { Clock } from '../../domain/ports';
export interface CronScheduler { schedule(expr: string, fn: () => void): void }
export function createCronScheduler(): CronScheduler  // delegates to cron.schedule
```

## Shims

```ts
// src/networkmap/index.ts  (temporary)
export * from '../infrastructure/networkmap/public-api';
```

Create `src/infrastructure/networkmap/public-api.ts` that binds
`requestNetworkMap`, `triggerManualRefresh`, `startNetworkmapScheduler` to the
container scanner/scheduler with the original names. This keeps the old import
path working until task 11.

## Verify

- `npm run build` exits 0.
- `npm test` green. `test/api.test.mjs` includes `/api/network/refresh`; ensure
  the rate-limit and in-flight status codes are unchanged.

## Done when

Networkmap is an adapter behind `MeshScanner`, old path shimmed, build + tests
green.
