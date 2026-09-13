# Clean Architecture Port — Execution Plan

## Objective

Refactor `zigbee-mesh-health` from a technology-grouped layout (`src/db`, `src/mqtt`,
`src/api`, `src/analysis`, `src/networkmap`) into Clean Architecture layers:

```
domain  <-  application  <-  infrastructure  <-  composition
```

The dependency rule points inward: outer layers know inner layers, never the
reverse. `domain` is pure TypeScript (no Node, no Prisma, no MQTT, no Express).

## Non-goals (hard constraints)

- **No behavior change.** API responses, golden fixtures, SSE semantics, MQTT
  subscriptions, retention math and classification order must stay byte-identical.
- **No schema change.** `prisma/schema.prisma` and the DDL in `schema.ts` stay
  identical (only comment references may be updated).
- **No new runtime dependencies.** Use only what is already in `package.json`.
- **Public function names and signatures stay stable** through the
  `composition/container.ts` seam (see below), so tests change import paths only.
- `tsconfig.json` unchanged: `rootDir: src`, `outDir: dist`, CommonJS.

## Target tree

```
src/
├── domain/                                   # pure, zero dependencies
│   ├── entities.ts                           # DeviceSummary, EventType, EventRow, LinkQualitySample, ...
│   ├── ports.ts                              # repository + gateway interfaces
│   ├── health-policy.ts                      # classifyDeviceStatus() (pure thresholds)
│   └── event-classification.ts               # classifyLogging(), extractDeviceName() (pure regex)
│
├── application/                              # use cases, depend on domain only
│   ├── buffer/
│   │   └── LinkQualityBuffer.ts              # enqueue/flush/interval, emits sample kicks
│   └── use-cases/
│       ├── RecordLinkQualitySample.ts
│       ├── RecordStateChange.ts
│       ├── IngestLogging.ts
│       ├── IngestBridgeEvent.ts
│       ├── DetectBridgeIdentityChange.ts
│       ├── ComputeDeviceHealth.ts
│       ├── QueryDeviceHistory.ts
│       ├── QueryMeshHistory.ts
│       ├── QueryEvents.ts
│       ├── QueryDevices.ts
│       ├── GetLatestNetworkSnapshot.ts
│       ├── ManageAliases.ts
│       ├── ApplyRetention.ts
│       ├── GetHealthStatus.ts
│       └── RefreshNetworkMap.ts
│
├── infrastructure/                           # adapters, depend on domain + application
│   ├── config.ts                             # was src/config.ts
│   ├── runtime.ts                            # was src/runtime.ts (implements RuntimeStatusStore)
│   ├── clock/SystemClock.ts
│   ├── persistence/sqlite/
│   │   ├── prismaClient.ts                   # was src/db/client.ts
│   │   ├── schema.ts                         # was src/db/bootstrap.ts
│   │   ├── PrismaSampleRepository.ts
│   │   ├── PrismaEventRepository.ts
│   │   ├── PrismaSnapshotRepository.ts
│   │   ├── PrismaAliasRepository.ts
│   │   └── PrismaRuntimeStateRepository.ts
│   ├── messaging/
│   │   ├── InMemoryEventBus.ts               # sampleBus + eventBus (EventEmitter singletons)
│   │   ├── MqttClient.ts                     # was src/mqtt/client.ts
│   │   └── MqttMessageRouter.ts              # was src/mqtt/eventCollector.ts + lqiCollector.ts routing + index.ts
│   ├── networkmap/
│   │   ├── MqttMeshScanner.ts                # was src/networkmap/index.ts network logic
│   │   └── NetworkMapScheduler.ts            # cron wrapper
│   ├── http/
│   │   ├── Sse.ts
│   │   └── ExpressServer.ts                  # was src/api/server.ts
│   └── scheduler/CronScheduler.ts            # node-cron wrapper for retention + networkmap
│
└── composition/
    ├── container.ts                          # default wired singletons + public seam (tests import here)
    └── main.ts                               # was src/index.ts
```

## Dependency rule

| Layer | May import |
|---|---|
| `domain` | only other `domain` files. No `node:*`, no npm packages, no `generated/prisma`. |
| `application` | `domain` only. |
| `infrastructure` | `domain`, `application`, npm packages, `node:*`, `generated/prisma`. |
| `composition` | everything. |

Enforced by `test/architecture.test.mjs` (task 12) which scans `src/**/*.ts`
import statements.

## Layer responsibilities

- **domain** — types + business invariants. Thresholds, event classification
  regexes, status decision. No IO, no `Date.now()` (clock is injected).
- **application** — orchestrates ports. One use case per file, constructor
  injection. Contains the logic currently inside repositories/collectors/analysis
  (buffer, transition detection, version anchor, retention aggregation, health
  computation, range parsing).
- **infrastructure** — Prisma, MQTT, Express, cron, Node `EventEmitter`. Converts
  wire formats to domain types; never contains business rules.
- **composition** — builds concrete adapters, wires use cases, owns process
  lifecycle (start/stop, SIGINT/SIGTERM).

## Symbol relocation map

| Old path | New home | Exported names (unchanged) |
|---|---|---|
| `src/config.ts` | `src/infrastructure/config.ts` | `config`, `ensureDataDir`, `dbFile` |
| `src/runtime.ts` | `src/infrastructure/runtime.ts` | `runtimeStatus` |
| `src/db/client.ts` | `src/infrastructure/persistence/sqlite/prismaClient.ts` | `getDb`, `closeDb`, `getPrisma`, `closePrisma` |
| `src/db/bootstrap.ts` | `src/infrastructure/persistence/sqlite/schema.ts` | `bootstrapSchema` |
| `src/db/repositories/samples.ts` | `.../PrismaSampleRepository.ts` + `application/buffer/LinkQualityBuffer.ts` | `history`, `meshHistory`, `listDeviceNames`, `latestLqiPerDevice`, `enqueueSample`, `flushSamples`, `startBatchWriter`, `stopBatchWriter` |
| `src/db/repositories/events.ts` | `.../PrismaEventRepository.ts` + `infrastructure/messaging/InMemoryEventBus.ts` | `insertEvent`, `listEvents`, `EventType`, `EventRow`, `eventBus` |
| `src/db/repositories/snapshots.ts` | `.../PrismaSnapshotRepository.ts` | `insertSnapshot`, `getLatestSnapshot` |
| `src/db/repositories/aliases.ts` | `.../PrismaAliasRepository.ts` | `getAllAliases`, `setAlias` |
| `src/db/repositories/runtimeState.ts` | `.../PrismaRuntimeStateRepository.ts` | `getValue`, `setValue`, `withKeyLock` |
| `src/db/repositories/retention.ts` | `application/use-cases/ApplyRetention.ts` | `runRetentionOnce`, `startRetentionJob` |
| `src/analysis/status.ts` | `application/use-cases/ComputeDeviceHealth.ts` + `domain/health-policy.ts` | `computeDeviceSummaries`, `DeviceSummary`, `DeviceStatus` |
| `src/mqtt/client.ts` | `src/infrastructure/messaging/MqttClient.ts` | `getClient` |
| `src/mqtt/eventCollector.ts` | `application/use-cases/IngestLogging.ts`, `IngestBridgeEvent.ts`, `DetectBridgeIdentityChange.ts` + `infrastructure/messaging/MqttMessageRouter.ts` | `classifyLogging`, `extractDeviceName`, `handleLogging`, `handleBridgeEvent`, `handleInfo`, `handleDevices`, `startEventCollector` |
| `src/mqtt/lqiCollector.ts` | `application/use-cases/RecordLinkQualitySample.ts`, `RecordStateChange.ts` + router | `handleDeviceMessage`, `startLqiCollector`, `setDeviceIeee` |
| `src/mqtt/index.ts` | `infrastructure/messaging/MqttMessageRouter.ts` | `startCollectors` |
| `src/networkmap/index.ts` | `infrastructure/networkmap/MqttMeshScanner.ts` + `NetworkMapScheduler.ts` + `application/use-cases/RefreshNetworkMap.ts` | `requestNetworkMap`, `triggerManualRefresh`, `startNetworkmapScheduler` |
| `src/api/server.ts` | `src/infrastructure/http/ExpressServer.ts` + `Sse.ts` | `startApi` |
| `src/index.ts` | `src/composition/main.ts` | process entry side effects |

## The composition seam

`src/composition/container.ts` builds the default (singleton) object graph and
re-exports the wired public API under the **same names/signatures** as today, plus
`container` for direct use. Tests import only:

```js
const { ... } = await import('../dist/composition/container.js');
```

Re-exported: `config`, `ensureDataDir`, `dbFile`, `runtimeStatus`, `getDb`,
`closeDb`, `getPrisma`, `closePrisma`, `sampleBus`, `eventBus`, `history`,
`meshHistory`, `listDeviceNames`, `latestLqiPerDevice`, `enqueueSample`,
`flushSamples`, `startBatchWriter`, `stopBatchWriter`, `insertEvent`, `listEvents`,
`insertSnapshot`, `getLatestSnapshot`, `getAllAliases`, `setAlias`, `getValue`,
`setValue`, `withKeyLock`, `runRetentionOnce`, `startRetentionJob`,
`computeDeviceSummaries`, `classifyLogging`, `extractDeviceName`, `handleLogging`,
`handleBridgeEvent`, `handleInfo`, `handleDevices`, `handleDeviceMessage`,
`setDeviceIeee`, `startEventCollector`, `startLqiCollector`, `startCollectors`,
`requestNetworkMap`, `triggerManualRefresh`, `startNetworkmapScheduler`,
`startApi`, plus domain types.

## Migration strategy: temporary re-export shims

To keep every intermediate state buildable and the suite green, each move task
**leaves the old path in place as a one-line re-export shim**:

```ts
// src/db/repositories/samples.ts  (temporary, deleted in task 11)
export * from '../../infrastructure/persistence/sqlite/PrismaSampleRepository';
```

Task 11 deletes every shim and updates test imports to `composition/container.js`.
Shims are the only accepted temporary duplication; they must not contain logic.

## Verification per task

- Always: `npm run build` (must exit 0).
- Where noted: `npm test` (must stay green — golden fixtures unchanged).
- Final gate (task 11/12): `npm test` green with zero shims remaining.

## Task order (one sub-agent per task, sequential)

| # | File | Summary |
|---|---|---|
| 01 | `01-domain-layer.md` | Add `domain/` entities, ports, pure policy/classification. Additive. |
| 02 | `02-infrastructure-config-runtime.md` | Move config + runtime; add `SystemClock`; shim old paths. |
| 03 | `03-persistence-core.md` | Move Prisma client + schema bootstrap; shim old paths. |
| 04 | `04-persistence-repositories.md` | Move 5 repositories to port-implementing classes; add `InMemoryEventBus`; seed container. |
| 05 | `05-application-ingestion-use-cases.md` | Extract ingestion logic (logging, bridge events, info, state/sample) into use cases. |
| 06 | `06-application-query-manage-use-cases.md` | Extract queries, health, aliases, retention, range parsing into use cases. |
| 07 | `07-infrastructure-messaging.md` | MQTT client + message router wire adapters to use cases. |
| 08 | `08-infrastructure-networkmap.md` | MQTT mesh scanner + cron scheduler adapters. |
| 09 | `09-infrastructure-http.md` | Express server + SSE adapter. |
| 10 | `10-composition-root.md` | `composition/main.ts`, replace `src/index.ts`, wire full graph. |
| 11 | `11-remove-shims-update-tests.md` | Delete all shims/old dirs, point tests at container, full suite green. |
| 12 | `12-architecture-guard-and-docs.md` | Add dependency-rule test; update README; final verify. |

## Risks and mitigations

- **Prisma generated import depth.** `../generated/prisma/client` becomes
  `../../generated/prisma/client` in `infrastructure/persistence/sqlite/`. Fix
  relative paths in task 03; `rootDir: src` keeps `dist` layout correct.
- **Global singletons.** `getClient()`, `getPrisma()`, `eventBus`, `sampleBus` must
  stay single-instance. Container builds each exactly once and passes them down.
- **Circular imports.** `MqttMessageRouter` depends on use cases; use cases depend
  only on ports. Never import infrastructure from application.
- **Golden fixtures.** Any behavioral drift is a task failure. Do not "fix" a
  failing golden — revert the drift.
- **Intermediate red.** With shims, `npm test` stays green; if a task genuinely
  cannot keep it green, the task file says so explicitly.

## Rollback

Each task is a self-contained commit. Reverting one task leaves the shims and the
prior layer intact, so the build and tests return to the previous green state.
