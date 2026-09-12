# Port to an ORM — Prisma (plan)

Status: draft · Last updated: 2026-09-12

## Goal

Replace the hand-rolled `better-sqlite3` persistence layer in `src/storage/*`
and the raw SQL in `src/analysis/status.ts` with Prisma ORM, without changing
observable behavior of the three data channels, the HTTP API, or the on-disk
database.

Scope per decision: **full app restructure** — a Prisma client module, a
repository layer, persisted runtime state.

## Stack decision

- ORM: **Prisma** (`@prisma/client` + `prisma` CLI).
- Driver: **`@prisma/adapter-better-sqlite3`** (driver adapter), not Prisma's
  native SQLite engine.

Rationale:

1. Keeps `better-sqlite3`, which already builds for the four HA add-on arches
   (`aarch64`, `amd64`, `armv7`, `i386`). Prisma's native engine is not
   guaranteed on 32-bit (`armv7`/`i386`).
2. The adapter's default `timestampFormat: "iso8601"` stores `DateTime` as
   ISO-8601 TEXT — read-compatible with today's `new Date().toISOString()`
   rows. No timestamp data migration. Note (found in 11): the adapter *writes*
   the `+00:00` suffix, not `Z`; both parse identically and the repos normalise
   on read, but the on-disk bytes differ from the old build (see 11 Rollback).
3. SQLite date/time functions (`strftime`) keep working in the raw aggregate
   queries.

Accepted tradeoff: Prisma is heavier than a query builder. Chosen explicitly.
`00-engine-and-driver-strategy.md` verifies the adapter path and arch support
before any production code moves.

## Ground rules (from the existing code)

- Do not touch channel semantics: passive LQI, rare active networkmap, bridge
  events. `src/networkmap/index.ts` stays the only publisher.
- Keep `PRAGMA journal_mode = WAL` and single-process access.
- Keep the in-memory batch writer for LQI (`FLUSH_INTERVAL_MS` /
  `FLUSH_BATCH_SIZE`); only its flush target changes.
- Raw SQL stays raw where an ORM is a bad fit: bucketed `meshHistory`,
  retention `INSERT ... SELECT ... ON CONFLICT`, rolling averages.
- No schema/data change for existing installs. Existing table and index names
  and column types stay.

## Key decisions

| id | decision | where |
|----|----------|-------|
| D1 | Use the better-sqlite3 driver adapter, not the native engine | 00, 01 |
| D2 | Keep `iso8601` timestamps (read-compatible; write suffix differs, see 11) | 02 |
| D3 | Keep idempotent DDL bootstrap; no Prisma Migrate in v1 | 02 |
| D4 | `src/db/` with function-based repositories, same signatures | 03 |
| D5 | Keep hard SQL as `$queryRaw` / `$executeRaw` | 04–07 |
| D6 | Persist runtime state to a small KV table | 08 |

## Subtasks

| # | task | depends on | status |
|---|------|------------|--------|
| 00 | [Engine & driver strategy](00-engine-and-driver-strategy.md) | — | [x] |
| 01 | [Prisma setup](01-prisma-setup.md) | 00 | [x] |
| 02 | [Schema & DB bootstrap](02-schema-and-bootstrap.md) | 01 | [x] |
| 03 | [Data access layer](03-data-access-layer.md) | 02 | [x] |
| 04 | [Port LQI samples](04-port-lqi-samples.md) | 03 | [x] |
| 05 | [Port events](05-port-events.md) | 03 | [x] |
| 06 | [Port snapshots & retention](06-port-snapshots-and-retention.md) | 03 | [x] |
| 07 | [Port analysis/status](07-port-analysis-status.md) | 03, 04, 05 | [x] |
| 08 | [Persist runtime state](08-runtime-state-persistence.md) | 03 | [x] |
| 09 | [Config & lifecycle wiring](09-config-and-lifecycle.md) | 01, 03 | [x] |
| 10 | [Build & deploy](10-build-and-deploy.md) | 01, 02 | [x] |
| 11 | [Verification & rollback](11-verification-and-rollback.md) | all | [x] |

## Sequencing

```
00 -> 01 -> 02 -> 03 -> {04, 05, 06, 08} -> 07 -> 09 -> 10 -> 11
```

04/05/06/08 are independent once 03 lands; 07 needs 04 + 05; 09 can start after
01 + 03.

## Out of scope

- Switching database engine.
- Prisma Migrate history / auto-migrations at runtime.
- Changing API contracts, frontend, MQTT topics, or alert thresholds.
- Relations/foreign keys. The tables are intentionally independent. Do not
  invent a `Device` entity in v1.

## Definition of done

- `npm run build` clean, no `better-sqlite3` calls outside `src/db/client.ts`.
- Existing `data/mesh-health.db` opens with no data loss or column change.
- `scripts/test-events.mjs` and `scripts/test-status.mjs` pass.
- Documented API endpoints return the same JSON as before.
- Docker + the kept add-on arches build.
