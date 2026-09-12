# 07 — Port analysis/status

Depends on: 03, 04, 05

## Goal

Replace the raw aggregate queries in `src/analysis/status.ts` with the
repository/Prisma layer, or keep them raw if the ORM cannot express them
cleanly.

## Current queries

- `avgLqiPerDevice(sinceMs)`:
  `SELECT device_name, AVG(lqi) FROM linkquality_samples WHERE ts >= ? GROUP BY device_name`
- `failuresPerDevice(sinceMs)`:
  `SELECT device_name, COUNT(*) FROM log_events WHERE event_type IN (...) AND ts >= ? AND device_name IS NOT NULL GROUP BY device_name`
- `latestLqiPerDevice()` from `samples.ts` (04).

## Approach

Prefer `prisma.linkQualitySample.groupBy({ by: ['deviceName'], where: { ts:
{ gte } }, _avg: { lqi: true } })` and `prisma.logEvent.groupBy({ by:
['deviceName'], where: { eventType: { in: [...] }, ts: { gte }, deviceName: {
not: null } }, _count: true })`.

If `groupBy` cannot express the `IN` + `IS NOT NULL` filter in one typed call
in the chosen Prisma version, fall back to `$queryRaw` for that query and note
why. Do not contort the code to avoid raw SQL.

- Keep `computeDeviceSummaries()` threshold logic exactly as-is; only its data
  sources change.
- Coerce any `BigInt` counts with `Number()`.

## Acceptance

- `computeDeviceSummaries()` returns identical output for a seeded fixture:
  same order, same `ok/warning/critical`, same `avg24h/avg7d/failures24h`.

## ponytail

Do not move threshold logic into SQL; it stays in TypeScript and config.
