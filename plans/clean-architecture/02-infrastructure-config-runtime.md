# Task 02 — Infrastructure: config, runtime, clock

**Depends on:** task 01.
**Touches:** `src/infrastructure/config.ts`, `src/infrastructure/runtime.ts`,
`src/infrastructure/clock/SystemClock.ts`; converts `src/config.ts` and
`src/runtime.ts` into shims.

## Goal

Move environment config and mutable runtime status into `infrastructure/`, add a
`SystemClock`, and keep every existing import path working via shims.

## Files to create

### `src/infrastructure/config.ts`

Move `src/config.ts` verbatim. Only adjust: no imports change (still `fs`,
`path`). Content identical. Exports `config`, `ensureDataDir`, `dbFile`.

### `src/infrastructure/runtime.ts`

Start from `src/runtime.ts` but implement the `RuntimeStatusStore` port:

```ts
import type { RuntimeStatusStore, RuntimeStatusSnapshot } from '../domain/ports';

export const runtimeStatus = {
  mqttConnected: false,
  lastSampleAt: null as Date | null,
  lastSnapshotAt: null as Date | null,
};

export const runtimeStatusStore: RuntimeStatusStore = {
  snapshot: () => ({
    mqttConnected: runtimeStatus.mqttConnected,
    lastSampleAt: runtimeStatus.lastSampleAt,
    lastSnapshotAt: runtimeStatus.lastSnapshotAt,
  }),
  setMqttConnected: (v) => { runtimeStatus.mqttConnected = v; },
  markSampleAt: (d) => { runtimeStatus.lastSampleAt = d; },
  markSnapshotAt: (d) => { runtimeStatus.lastSnapshotAt = d; },
};
```

Keep `runtimeStatus` exported (consumers/tests rely on it).

### `src/infrastructure/clock/SystemClock.ts`

```ts
import type { Clock } from '../../domain/ports';
export const systemClock: Clock = { now: () => Date.now() };
```

## Files to modify (shims)

Replace the bodies (do not delete yet):

```ts
// src/config.ts
export * from './infrastructure/config';
```

```ts
// src/runtime.ts
export * from './infrastructure/runtime';
```

## Import updates

None required this task if shims are used. Leave all existing importers as-is.

## Verify

- `npm run build` exits 0.
- `npm test` green.

## Done when

New files exist, old two paths are re-export shims, build + tests green.
