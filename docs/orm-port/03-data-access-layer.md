# 03 — Data access layer

Depends on: 02
Blocks: 04, 05, 06, 07, 08, 09

## Goal

Restructure `src/storage/*` into `src/db/` with a single Prisma client and
per-table repository modules, keeping existing function signatures so callers
change only their import path.

## Target layout

```
src/db/
  client.ts              # PrismaClient + adapter singleton, WAL pragma, connect/close
  bootstrap.ts           # idempotent DDL (02)
  repositories/
    samples.ts           # was src/storage/samples.ts
    events.ts            # was src/storage/events.ts
    snapshots.ts         # was src/storage/snapshots.ts
    retention.ts         # was src/storage/retention.ts
    runtimeState.ts      # new, from 08
```

`src/storage/` is deleted once all imports move. Keep function names and
signatures (`enqueueSample`, `history`, `listEvents`, ...) to minimize churn.

## client.ts

- Build `new PrismaBetterSqlite3({ url: 'file:' + path.join(ensureDataDir(),
  'mesh-health.db') })`.
- `new PrismaClient({ adapter })`.
- Export `getPrisma()` returning the singleton.
- On first open: run the WAL pragma
  (`$executeRawUnsafe('PRAGMA journal_mode=WAL;')`) — WAL is a persistent DB
  property, so once is enough — then run `bootstrap()`.
- Export `closePrisma()` for shutdown.

## Rules

- Repositories export functions, not classes or interfaces.
- Never leak `PrismaClient` types into API/analysis call sites; return plain
  objects with the same shape the current code returns.
- Raw SQL only where justified (04–07); document each with a `ponytail:` note.

## Acceptance

- `getPrisma()` and `closePrisma()` exported; no other module imports
  `better-sqlite3` or `PrismaClient` directly.
- `npm run build` passes with import paths updated.
- No behavior change; prefer landing 04–06 in the same change to avoid a
  half-ported tree.

## ponytail

One process-wide client; Prisma manages its own pool. No connection factory,
no repository interfaces, no base class, no DI container.
