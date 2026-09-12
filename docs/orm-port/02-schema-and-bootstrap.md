# 02 — Schema & DB bootstrap

Depends on: 01
Blocks: 03, 10

## Goal

Represent the four existing tables in `schema.prisma` exactly as they exist,
and keep the idempotent DDL bootstrap so existing and fresh installs both work
without Prisma Migrate at runtime.

## Model mapping

| current table | Prisma model | notes |
|---------------|--------------|-------|
| `linkquality_samples` | `LinkQualitySample` | `@@index([deviceName, ts])` |
| `network_snapshots` | `NetworkSnapshot` | |
| `log_events` | `LogEvent` | `@@index([eventType, ts])` |
| `linkquality_daily_summary` | `LinkQualityDailySummary` | `@@id([deviceName, day])` |

Use `@map` / `@@map` to keep the existing snake_case table and column names.
`ts` stays the Prisma field name and the `DATETIME` declared column.
`eventType` stays `String` (validated by the existing TS `EventType` union);
SQLite enum support varies across Prisma versions — do not depend on it.
`day` stays `String` (`YYYY-MM-DD` from `strftime`).

## Timestamp format (D2)

Keep the adapter default `timestampFormat: "iso8601"`. Existing rows are
`new Date().toISOString()` TEXT and the adapter writes the same. Do NOT enable
`unixepoch-ms`: it would require migrating every timestamp and would break
`strftime` and ISO string comparisons. Verified in 00.

## DDL bootstrap (D3)

Keep the `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` block,
moved to `src/db/bootstrap.ts` and kept in sync with `schema.prisma`.

Rationale: single-file homelab DB on a persistent volume; running
`prisma migrate deploy` would drag the Prisma CLI into the runtime image and
need a baseline dance for already-deployed databases. Revisit only if schema
changes become frequent.

Add a comment at the top of both files pointing at each other: schema changes
must update both.

## Steps

1. Write the four models.
2. Move the DDL into `bootstrap.ts`; call it on first client open.
3. `prisma format` + `prisma validate`.
4. Open the existing dev DB and assert the client reads all four tables.

## Acceptance

- `prisma validate` passes.
- Reading an existing `data/mesh-health.db` yields the same row counts as
  before the change.
- A fresh `DATA_DIR` creates an identical schema (compare `.schema`).

## ponytail

No migrations folder in v1. If versioned migrations become necessary, generate
a baseline from the current schema and `migrate resolve --applied` on existing
DBs once, documented then.
