# Mesh Health — Subtask Index for Sub-agents

The full product spec lives in `/instruction.md` (repo root). Every sub-agent MUST read it before starting its task. Each numbered file below is a self-contained subtask: scope, interface contracts, constraints, and acceptance criteria.

## Execution rules

- Work only inside the repo. Do not touch files owned by another task unless your task says so (dependencies list them).
- After finishing, run the acceptance criteria for your task, then mark the checkbox below (`[ ] -> [x]`).
- If a checkbox of a dependency is unchecked, do not start — wait or report the blocker.
- Keep changes minimal; follow the TypeScript scaffold (`npm run build` must pass).

## Checkbox list

- [x] [01 — Foundation: config + storage](./01-foundation.md)
- [x] [02 — MQTT collectors (passive LQI + bridge events)](./02-mqtt-collectors.md)
- [x] [03 — Networkmap manager (scheduler + manual trigger)](./03-networkmap.md)
- [ ] [04 — Analysis: moving averages + device status](./04-analysis.md)
- [ ] [05 — Express API + app wiring](./05-api.md)
- [ ] [06 — Frontend: 4 views + design tokens](./06-frontend.md)
- [ ] [07 — Docker + README + final verification](./07-deploy-readme-verify.md)

## Dependency graph

```
01 ──► 02 ──┐
   ──► 03 ──┤
   ──► 04 ──┤
   ──► 06 ──┼─► 05 ──► 07
```
01 is blocking-first (it installs all npm dependencies and defines the exports the
others consume). 02, 03, 04 and 06 can run in parallel after 01.
05 integrates their modules. 07 documents and verifies the whole thing.

## Cross-task interface contract (owned by task 01)

Other tasks MUST use these exports exactly; task 01 is their source of truth:

- `src/config.ts` → `export const config: { mqttHost: string; mqttPort: number; mqttUsername?: string; mqttPassword?: string; baseTopic: string; httpPort: number; dataDir: string; networkmapSchedule: string; networkmapTimeoutMs: number; warningThresholdPct: number; criticalAbsolute: number; routeFailureCriticalCount: number; retentionDays: number; apiKey?: string; flushIntervalMs: number; flushBatchSize: number; }`
- `src/runtime.ts` → `export const runtimeStatus: { mqttConnected: boolean; lastSampleAt: Date | null; lastSnapshotAt: Date | null; }`
- `src/storage/db.ts` → `getDb()`, `closeDb()`
- `src/storage/samples.ts` → `enqueueSample(device: string, ieee: string | null, lqi: number)`, `startBatchWriter()`, `stopBatchWriter()`, `flushSamples()`, `latestLqiPerDevice()`, `history(device: string, sinceMs: number)`, `listDeviceNames()`
- `src/storage/events.ts` → `insertEvent(type: EventType, device: string | null, message: string)`, `listEvents({ type?, sinceMs?, limit? })`; `export type EventType = 'route_failure' | 'delivery_failure' | 'device_leave' | 'bridge_restart' | 'version_change' | 'other'`
- `src/storage/snapshots.ts` → `insertSnapshot(rawJson: string)`, `getLatestSnapshot()`
- `src/storage/retention.ts` → `runRetentionOnce()`, `startRetentionJob()`
