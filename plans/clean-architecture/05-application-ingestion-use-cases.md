# Task 05 — Application: ingestion use cases

**Depends on:** task 04.
**Touches:** `application/buffer/LinkQualityBuffer.ts` and four ingestion use
cases; shims for `src/mqtt/eventCollector.ts` and `src/mqtt/lqiCollector.ts`
handlers (routing itself moves in task 07).

## Goal

Move all ingestion business logic out of the MQTT collectors into application use
cases that depend on domain ports only.

## Files to create

### `src/application/buffer/LinkQualityBuffer.ts`

Extract the buffer from `src/db/repositories/samples.ts:10-57`.

```ts
import type { SampleRepository, EventBus, Clock } from '../../domain/ports';

export function createLinkQualityBuffer(deps: {
  samples: SampleRepository;
  bus: EventBus;
  clock: Clock;
  flushIntervalMs: number;
  flushBatchSize: number;
}) {
  return {
    enqueueSample(device: string, ieee: string | null, lqi: number): void,
    flushSamples(): Promise<void>,   // saveBatch + bus.emit('sample'); no-op if empty
    startBatchWriter(): void,        // setInterval(...).unref()
    stopBatchWriter(): Promise<void>,
  };
}
```

Keep the `sampleBus.emit('sample')` only on a non-empty flush and the
`timer.unref()` behavior.

### `src/application/use-cases/IngestLogging.ts`

From `src/mqtt/eventCollector.ts:69-88` + pure functions from
`domain/event-classification.ts`. Parse JSON, classify via
`classifyLogging`, drop unmatched `debug`, extract device for `device_leave`,
call `EventRepository.insert`. Invalid JSON and non-object payloads are ignored
(return, no throw) exactly as today.

```ts
export function createIngestLogging(deps: { events: EventRepository }) {
  return { handle(payload: Buffer): Promise<void> };
}
```

### `src/application/use-cases/IngestBridgeEvent.ts`

From `src/mqtt/eventCollector.ts:92-111`. Structured `bridge/event` handling:
name from `friendly_name` else `ieee_address`, `device_leave` vs `other`,
message format `bridge event: <type> '<name>'` byte-identical.

### `src/application/use-cases/DetectBridgeIdentityChange.ts`

From `src/mqtt/eventCollector.ts:122-191` (`handleDevices` + `handleInfo`).
Two responsibilities, same file:
- `handleDevices(payload)`: parse retained array, call an injected
  `setDeviceIeee(friendlyName, ieee)` callback for valid entries.
- `handleInfo(payload)`: version anchor/change logic and coordinator identity,
  both under `RuntimeStateRepository.withKeyLock`, calling
  `EventRepository.insert`. Keep exact messages:
  `Z2M bridge online, version <v>`, `Z2M version changed: <old> → <v>`,
  `Coordinator changed: <old> → <coord>`.

```ts
export function createDetectBridgeIdentityChange(deps: {
  events: EventRepository;
  state: RuntimeStateRepository;
  setDeviceIeee(fn: (name: string, ieee: string) => void): void;
})
```

### `src/application/use-cases/RecordStateChange.ts`

From `src/mqtt/lqiCollector.ts:49-63`. Under `withKeyLock(last_state:<device>)`,
compare with stored value, insert `state_change` only on a real transition with
message `state: <prev> → <next>`, then persist. First sight is the baseline (no
event).

### `src/application/use-cases/RecordLinkQualitySample.ts`

From `src/mqtt/lqiCollector.ts:65-72`. Validate finite numeric `linkquality`,
resolve IEEE from payload else the injected map, call
`buffer.enqueueSample`, mark `runtimeStatus` sample time via
`RuntimeStatusStore.markSampleAt`.

```ts
export function createRecordLinkQualitySample(deps: {
  buffer: ReturnType<typeof createLinkQualityBuffer>;
  runtime: RuntimeStatusStore;
  clock: Clock;
  ieeeLookup: Map<string, string>;
})
```

### `src/application/use-cases/IngestDeviceMessage.ts` (optional helper)

If it reduces duplication, a thin coordinator that runs `RecordStateChange` then
`RecordLinkQualitySample`, preserving the current order and the
`bridge/#` early-return from `src/mqtt/lqiCollector.ts:30-47`. Keep it in
application, not infrastructure.

## Shims

- `src/db/repositories/samples.ts`: route `enqueueSample`/`flushSamples`/
  `startBatchWriter`/`stopBatchWriter` to the container buffer; delete the
  duplicated buffer implementation. Keep `history`/`meshHistory`/etc. routed to
  the repository (done in task 04).
- Do NOT yet touch `src/mqtt/*` (task 07 wires them); those still work through
  the container.

## Verify

- `npm run build` exits 0.
- `npm test` green. `test/events.test.mjs` (classification, transitions, locks,
  info anchor) and `test/samples.test.mjs` (buffer flush) must pass unchanged in
  behavior.

## Done when

Ingestion logic lives in `application/`, container exposes the old function
names, build + tests green.
