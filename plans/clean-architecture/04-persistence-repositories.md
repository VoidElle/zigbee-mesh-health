# Task 04 — Infrastructure: repositories + event bus + container seed

**Depends on:** task 03.
**Touches:** five new `*Repository.ts` files, `infrastructure/messaging/InMemoryEventBus.ts`,
`composition/container.ts` (seed); shims for the five old repository files.

## Goal

Wrap Prisma access in port-implementing repository objects, move the in-process
SSE kick buses into infrastructure, and seed the composition container that
exposes the current public API.

## Files to create

Each repository is a factory returning an object that implements the matching
domain port. It still owns the raw SQL currently in the old repository files —
copy SQL and `ponytail:` comments verbatim. The DB handle is `getPrisma()` from
`prismaClient.ts`.

### `src/infrastructure/persistence/sqlite/PrismaSampleRepository.ts`

Implements `SampleRepository`. Source logic from `src/db/repositories/samples.ts`
(lines 59–120): `latestLqiPerDevice`, `history`, `meshHistory`, `listDeviceNames`.
Add `saveBatch(samples: LinkQualitySample[])` which performs the existing
`createMany` transaction from `flushSamples` (do NOT emit the bus here — the
application buffer does).

```ts
export function createPrismaSampleRepository(): SampleRepository
```

### `src/infrastructure/persistence/sqlite/PrismaEventRepository.ts`

Implements `EventRepository` from `src/db/repositories/events.ts` (lines 43–65):
`insert`, `list`. Preserve the `EventRow` mapping.

### `src/infrastructure/persistence/sqlite/PrismaSnapshotRepository.ts`

Implements `SnapshotRepository` from `src/db/repositories/snapshots.ts`:
`insert`, `latest`.

### `src/infrastructure/persistence/sqlite/PrismaAliasRepository.ts`

Implements `AliasRepository` from `src/db/repositories/aliases.ts`. The old
`setAlias` called `setValue` from runtimeState; instead depend on a
`RuntimeStateRepository` passed in:

```ts
export function createPrismaAliasRepository(state: RuntimeStateRepository): AliasRepository
```

### `src/infrastructure/persistence/sqlite/PrismaRuntimeStateRepository.ts`

Implements `RuntimeStateRepository` from `src/db/repositories/runtimeState.ts`,
including the `withKeyLock` promise-chain logic (copy verbatim; it is
intra-process ordering, not storage).

### `src/infrastructure/messaging/InMemoryEventBus.ts`

```ts
import { EventEmitter } from 'node:events';
import type { EventBus } from '../../domain/ports';

export function createInMemoryEventBus(): EventBus { ... } // EventEmitter + setMaxListeners(0)
```

Expose `EventBus` adapters. Because the old code + tests use module-level
singletons `sampleBus`/`eventBus`, the container owns exactly two instances and
re-exports them.

### `src/composition/container.ts` (seed — final wiring lands in task 10)

Build the default graph and re-export the public seam. For this task wire only
what exists: repositories + buses + config/runtime. Keep the shape:

```ts
export const sampleBus = createInMemoryEventBus();
export const eventBus = createInMemoryEventBus();
const prismaClient = { getDb, closeDb, getPrisma, closePrisma }; // imported
const stateRepo = createPrismaRuntimeStateRepository();
const sampleRepo = createPrismaSampleRepository();
const eventRepo = createPrismaEventRepository(sampleBus, eventBus);
const snapshotRepo = createPrismaSnapshotRepository();
const aliasRepo = createPrismaAliasRepository(stateRepo);

export { config, ensureDataDir, dbFile } from '../infrastructure/config';
export { runtimeStatus } from '../infrastructure/runtime';
export { getDb, closeDb, getPrisma, closePrisma } from '../infrastructure/persistence/sqlite/prismaClient';
export { sampleBus, eventBus };
```

Notes:
- `createPrismaEventRepository(bus, ...)` must emit `eventBus.emit('event')` after
  `insert`, matching old behavior.
- The buffer's `sampleBus.emit('sample')` lands in task 05; until then the old
  sample repository shim keeps working.

## Files to modify (shims)

Replace the five old repository files with re-export shims that keep the old
function signatures. Because the new code exposes factory objects, each shim
creates a default instance on first use and forwards:

```ts
// src/db/repositories/snapshots.ts  (temporary)
import { getLatestSnapshot as latest, insertSnapshot as insert } from '...';
export const insertSnapshot = (rawJson: string) => insert(rawJson);
export const getLatestSnapshot = () => latest();
```

Simplest reliable approach: each old file imports its new factory + the shared
repos from `composition/container` and re-exports bound methods with the original
names. `events.ts` additionally re-exports `eventBus` and `EventType`/`EventRow`
from domain. `samples.ts` keeps `enqueueSample`/`flushSamples`/buses temporarily
by delegating to the existing buffer logic (moved in task 05) — if the buffer is
not yet moved, leave `samples.ts` logic in place and only route the four query
functions to the new repo. Document any left-behind logic with a `ponytail:`
comment naming task 05 as the follow-up.

## Verify

- `npm run build` exits 0.
- `npm test` green (repository behavior unchanged).

## Done when

Port-implementing repositories + buses exist, container seeds, old paths still
resolve, build + tests green.
