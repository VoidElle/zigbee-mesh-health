# 05 — Port events

Depends on: 03

## Goal

`events.ts` uses Prisma, keeping the `EventType` and `EventRow` shapes.

## Changes

- `insertEvent` -> `prisma.logEvent.create({ data: { ts: new Date(),
  eventType: type, deviceName: device, message } })`.
- `listEvents({ type, sinceMs, limit })`: build a typed `where` object
  (`eventType: type`, `ts: { gte: new Date(...) }`), then
  `findMany({ where, orderBy: [{ ts: 'desc' }, { id: 'desc' }], take: limit,
  select: { id, ts, eventType, deviceName, message } })`. Map `ts` to an ISO
  string to preserve the API.
- Keep `EventType` and `EventRow` exported from this module; `api/server.ts`
  imports `EventType` from here.

## Acceptance

- Same signature and return shape; `ts` is an ISO string.
- `/api/events` filters (`type`, `since`, `limit`) behave identically,
  including the default limit 200 and the API clamp to 500.

## ponytail

No enum in the schema; the TS union is the single validation source.
