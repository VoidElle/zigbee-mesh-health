# 06 — Port snapshots & retention

Depends on: 03
Uses: raw SQL exception

## Goal

Port `snapshots.ts` fully; keep `retention.ts` as raw SQL.

## snapshots.ts

- `insertSnapshot(rawJson)` -> `prisma.networkSnapshot.create({ data: { ts:
  new Date(), rawJson } })`.
- `getLatestSnapshot()` -> `prisma.networkSnapshot.findFirst({ orderBy: { id:
  'desc' }, select: { ts, rawJson } })`, mapped to `{ ts: ISO, raw_json }` so
  `api/server.ts` stays untouched.

## retention.ts

The `INSERT ... SELECT ... GROUP BY ... ON CONFLICT DO UPDATE` plus `DELETE` is
exactly the set-based operation an ORM does badly. Keep it as two raw
statements inside `prisma.$transaction([...])`, changing only the call site
from `getDb()` to `getPrisma()`.

- Keep the weighted average formula byte-for-byte; it is correct and easy to
  break when rewritten per-row.
- `ponytail:` raw SQL here is intentional; the upgrade path is what this
  already is.

## Acceptance

- Retention on a seeded DB produces identical `linkquality_daily_summary` rows
  and identical `linkquality_samples` deletions vs. the old code (11).
- `insertSnapshot` / `getLatestSnapshot` behavior unchanged;
  `/api/network/latest` still 404s on malformed JSON.

## ponytail

Do not port retention to `upsert` in a loop; that is O(n) round trips.
