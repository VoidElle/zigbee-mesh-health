# 09 — Config & lifecycle wiring

Depends on: 01, 03
Blocks: 10

## Goal

Wire the Prisma client into startup/shutdown and configuration without adding
new env vars the user must set.

## config.ts

- No new required env var. `DATABASE_URL` is derived from `DATA_DIR` at runtime
  inside `client.ts`; do not read a static `.env`.
- Optionally export `dbFile()` to centralize the path
  (`path.join(ensureDataDir(), 'mesh-health.db')`) and have `client.ts` use it.

## index.ts

- Keep the existing start order. Prisma opens lazily on first query.
- `shutdown()`: after `stopBatchWriter()` (which flushes), call
  `await closePrisma()` before `process.exit(0)`. The MQTT `end` callback is
  callback-based; either await the flush/close there or restructure shutdown to
  an async function. Keep it minimal.
- Ensure the WAL pragma + bootstrap ran before the first write.

## Acceptance

- Start with an empty `DATA_DIR`: schema created, service runs, `/api/health`
  responds.
- SIGTERM flushes pending samples then closes cleanly; no WAL corruption on
  restart.

## ponytail

No DI, no lifecycle framework. A module-scoped singleton and two functions.
