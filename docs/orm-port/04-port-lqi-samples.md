# 04 — Port LQI samples

Depends on: 03
Uses: raw SQL exception

## Goal

`src/db/repositories/samples.ts` uses Prisma for inserts and raw SQL only for
the bucketed mesh aggregation.

## Keep as-is (batch writer)

The in-memory buffer + `setInterval`/size flush is a deliberate load shield for
SQLite. Keep it. Only `flushSamples()` changes:

- Replace the prepared `INSERT` + manual transaction with
  `prisma.linkQualitySample.createMany({ data: batch })`, wrapped in
  `prisma.$transaction(...)` to preserve the atomic flush.
- Map `{ device, ieee, lqi, ts }` to
  `{ deviceName, ieeeAddress, lqi, ts: new Date(r.ts) }`.
- `ponytail:` `createMany` is one statement; if Prisma's `createMany` is
  already atomic on SQLite (verify in 11), drop the explicit transaction.

## Queries

- `latestLqiPerDevice()`: the current correlated subquery
  (`MAX(id) GROUP BY device_name`) is awkward in Prisma. Keep it as
  `$queryRaw` with a `ponytail:` comment, or use `groupBy` + `_max` only if it
  stays one round trip and returns `Int`. Prefer correctness over ORM purity.
- `history(device, sinceMs)`: `findMany({ where: { deviceName, ts: { gte } },
  orderBy: { ts: 'asc' }, select: { lqi, ts } })`. Map `ts` back to ISO string
  for the API.
- `listDeviceNames()`: `findMany({ distinct: ['deviceName'], select: {...},
  orderBy: {...} })`.
- `meshHistory(sinceMs)`: keep the `strftime('%s', ts)` bucket `GROUP BY` as
  `$queryRaw`. Coerce `BigInt`/numeric results with `Number()`.

## Acceptance

- `latestLqiPerDevice`, `history`, `listDeviceNames`, `meshHistory`,
  `enqueueSample`, `startBatchWriter`, `stopBatchWriter` exported with
  unchanged signatures.
- `history` returns `{ lqi, ts: string }` (ISO), not `Date`.
- API `/api/devices/:name/history` and `/api/mesh/history` match captured
  fixtures (11).

## ponytail

Do not model devices as a related entity. `deviceName` is a plain string
column, as today.
