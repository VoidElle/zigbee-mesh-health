# 08 — Persist runtime state

Depends on: 03

## Goal

Move the in-memory change-detection state to the database so restarts do not
miss transitions or re-emit "first sight" anchor events.

## What is in memory today

- `src/mqtt/lqiCollector.ts`: `lastStates` (per-device last `state`).
- `src/mqtt/eventCollector.ts`: `lastZ2mVersion`, `lastCoordinator`.

Both files carry a `ponytail:` comment flagging the restart gap. This task
closes it.

## Design

- New table `runtime_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  -> `RuntimeState` model. No columns beyond that.
- `repositories/runtimeState.ts`: `getValue(key)`, `setValue(key, value)`.
- Keys: `last_state:<device>`, `last_z2m_version`, `last_coordinator`.
- On read, replace `Map`/variable lookups with `getValue`; on transition,
  `setValue`.
- Keep null/undefined semantics identical (baseline stores the value without
  emitting an event).

## Files

- `src/mqtt/lqiCollector.ts`, `src/mqtt/eventCollector.ts`
- `src/db/repositories/runtimeState.ts`, `src/db/bootstrap.ts`
- `prisma/schema.prisma`

## Acceptance

- Restart mid-session: a state transition after restart still emits exactly one
  event.
- First run on an empty DB still emits the Z2M-online anchor and no duplicate
  `state_change` for the baseline.

## ponytail

This is the only task that adds a table; it is justified by the existing code's
own note. Keep it a dumb KV store; do not normalize state into per-device rows.
