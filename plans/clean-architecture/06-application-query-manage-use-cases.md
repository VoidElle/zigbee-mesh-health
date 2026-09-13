# Task 06 — Application: query, health, aliases, retention use cases

**Depends on:** task 05.
**Touches:** query/health/manage use cases under `application/use-cases/`;
shims/routing for `src/analysis/status.ts` and `src/db/repositories/retention.ts`.

## Goal

Move read-side orchestration and maintenance logic into application use cases
that depend on domain ports only.

## Files to create

### `src/application/use-cases/ComputeDeviceHealth.ts`

From `src/analysis/status.ts`. Move the two aggregations
(`avgLqiPerDevice`, `failuresPerDevice`) to behind ports or reuse existing
repository query surface:
- `avgLqiPerDevice(sinceMs)` and `failuresPerDevice(sinceMs)` are Prisma
  `groupBy`s. Add them to `SampleRepository`/`EventRepository` ports OR add a
  dedicated `HealthQueryRepository` port. Prefer extending `SampleRepository`
  with `avgLqiPerDevice(sinceMs)` and `EventRepository` with
  `failureCountsPerDevice(sinceMs)` so all SQL stays in persistence.
- Use `domain/health-policy.classifyDeviceStatus` for the status decision.
- Inject `HealthThresholds` (built from config by composition).
- Preserve the sorted-by-name output and the `latest` fallback block
  (`src/analysis/status.ts:53-58`) with its `ponytail:` comment.

```ts
export function createComputeDeviceHealth(deps: {
  samples: SampleRepository;
  events: EventRepository;
  thresholds: HealthThresholds;
}): { computeDeviceSummaries(): Promise<DeviceSummary[]> }
```

### `src/application/use-cases/QueryDeviceHistory.ts`

Wrap `SampleRepository.history`, map to `{ ts, lqi }`, validate range is handled
by the HTTP adapter (keep the mapping identical to `src/api/server.ts:110`).

### `src/application/use-cases/QueryMeshHistory.ts`

Wrap `SampleRepository.meshHistory`.

### `src/application/use-cases/QueryDevices.ts`

Merge `latestLqiPerDevice()` with `AliasRepository.getAll()` and attach
`alias ?? null` (behavior from `src/api/server.ts:75-76`).

### `src/application/use-cases/QueryEvents.ts`

Wrap `EventRepository.list` with the validated filter object built by the HTTP
adapter (the adapter keeps query parsing; the use case just calls the repo).

### `src/application/use-cases/GetLatestNetworkSnapshot.ts`

Wrap `SnapshotRepository.latest()`.

### `src/application/use-cases/ManageAliases.ts`

From `src/db/repositories/aliases.ts` call sites: `getAllAliases()` and
`setAlias(name, alias)`. Validation (404/400/trim/max 60) stays in the HTTP
adapter; the use case takes an already-validated `alias: string | null`.

### `src/application/use-cases/ApplyRetention.ts`

From `src/db/repositories/retention.ts`. Keep the raw `INSERT ... ON CONFLICT`
SQL verbatim (it is set-based, an ORM handles it badly — keep the `ponytail:`
comment). Put the SQL in the persistence layer as
`SampleRepository.aggregateAndPurge(cutoff: string)` or a
`MaintenanceRepository` port, and make the use case:
`runRetentionOnce()` (compute cutoff from retentionDays + clock) and
`startRetentionJob()` (run once, then 24h interval, `.unref()`).

```ts
export function createApplyRetention(deps: {
  maintenance: MaintenanceRepository;
  clock: Clock;
  retentionDays: number;
}): { runRetentionOnce(): Promise<void>; startRetentionJob(): void }
```

### `src/application/use-cases/GetHealthStatus.ts`

Return the `RuntimeStatusSnapshot` from `RuntimeStatusStore` (HTTP adapter maps
Dates to ISO strings exactly as `src/api/server.ts:174-180`).

### `src/application/use-cases/RefreshNetworkMap.ts`

Thin pass-through to `MeshScanner` (`request`, `triggerManualRefresh`). The actual
MQTT/cron adapter lands in task 08; this use case lets the HTTP adapter depend on
application instead of infrastructure.

## Shims

- `src/analysis/status.ts` → re-export `computeDeviceSummaries` bound to the
  container instance, plus `DeviceSummary`/`DeviceStatus` from domain.
- `src/db/repositories/retention.ts` → re-export `runRetentionOnce` /
  `startRetentionJob` bound to the container instance.

## Verify

- `npm run build` exits 0.
- `npm test` green. `test/status.test.mjs` is the key guard (ok/warning/critical
  boundaries, 24h vs 7d windows, failure counts, mesh buckets).

## Done when

Read/maintenance logic lives in application, container re-exports old names,
build + tests green.
