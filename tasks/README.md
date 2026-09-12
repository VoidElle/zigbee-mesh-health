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
- [x] [04 — Analysis: moving averages + device status](./04-analysis.md)
- [x] [05 — Express API + app wiring](./05-api.md)
- [x] [06 — Frontend: 4 views + design tokens](./06-frontend.md)
- [x] [07 — Docker + README + final verification](./07-deploy-readme-verify.md)

## Phase 2 — Home Assistant add-on

Packs the finished app as an HA add-on (`addon/` dir; root Docker/standalone files untouched). Sub-agents read the task file; no `instruction.md` section exists for this phase — each task file is the spec.

- [x] [08 — Add-on scaffold: config.yaml, build.yaml, Dockerfile, run.sh](./08-ha-addon-scaffold.md)
- [x] [09 — Ingress wiring, DOCS.md, icons, translations](./09-ha-addon-ingress-docs.md)
- [x] [10 — Add-on repository + CI: multi-arch images on GHCR](./10-ha-addon-repo-ci.md)
- [ ] [11 — Install on HA, verify, document "how to add"](./11-ha-addon-verify.md)

Dependency graph (phase 2):

```
07 ──► 08 ──► 09 ──┐
          ──► 10 ──┴─► 11
```

08 creates `addon/` (manifest, image build, options→env translation, MQTT service
discovery via bashio, `/data` persistence). 09 (ingress/docs polish) and 10
(repository + CI) run in parallel after 08. 11 installs on a real HA instance,
runs the smoke checklist, and documents the add-steps. See task 11 for the exact
"add repository → install → configure → start" steps.

## Cross-task interface contract (owned by task 01)

Other tasks MUST use these exports exactly; task 01 is their source of truth:

- `src/config.ts` → `export const config: { mqttHost: string; mqttPort: number; mqttUsername?: string; mqttPassword?: string; baseTopic: string; httpPort: number; dataDir: string; networkmapSchedule: string; networkmapTimeoutMs: number; warningThresholdPct: number; criticalAbsolute: number; routeFailureCriticalCount: number; retentionDays: number; apiKey?: string; flushIntervalMs: number; flushBatchSize: number; }`
- `src/runtime.ts` → `export const runtimeStatus: { mqttConnected: boolean; lastSampleAt: Date | null; lastSnapshotAt: Date | null; }`
- `src/storage/db.ts` → `getDb()`, `closeDb()`
- `src/storage/samples.ts` → `enqueueSample(device: string, ieee: string | null, lqi: number)`, `startBatchWriter()`, `stopBatchWriter()`, `flushSamples()`, `latestLqiPerDevice()`, `history(device: string, sinceMs: number)`, `listDeviceNames()`
- `src/storage/events.ts` → `insertEvent(type: EventType, device: string | null, message: string)`, `listEvents({ type?, sinceMs?, limit? })`; `export type EventType = 'route_failure' | 'delivery_failure' | 'device_leave' | 'bridge_restart' | 'version_change' | 'other'`
- `src/storage/snapshots.ts` → `insertSnapshot(rawJson: string)`, `getLatestSnapshot()`
- `src/storage/retention.ts` → `runRetentionOnce()`, `startRetentionJob()`
