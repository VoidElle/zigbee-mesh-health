# 05 — Express API + app wiring

**Depends on:** 01, 02, 03, 04. Read `/instruction.md` §6 first.

## Goal

HTTP API per spec §6 + final `src/index.ts` wiring the whole service.

## Files

- `src/api/server.ts` — `export function startApi(): void`
- `src/index.ts` — entrypoint wiring (rewrite the scaffold placeholder)

## Middleware

- If `config.apiKey` is set: accept `Authorization: Bearer <key>` or `x-api-key` header for `/api/*`; otherwise 401 `{ error: 'unauthorized' }`. Static assets stay public. When unset: no auth.

## Endpoints (all JSON)

- `GET /api/devices` → `{ devices: DeviceSummary[] }` (from `computeDeviceSummaries()`).
- `GET /api/devices/:name/history?range=24h|7d|30d` → validate range → map to ms → `{ name, range, points: [{ ts, lqi }] }` device name `encodeURIComponent`-safed.
- `GET /api/events?type=&since=` → `{ events: [...] }` newest first; `since` accepts `24h|7d|30d` or ISO date; `type` optional, validated against `EventType`; invalid params → still safe defaults, `limit` capped at 500.
- `GET /api/network/latest` → latest snapshot parsed (`getLatestSnapshot()`); raw Z2M payload tolerance: `{ data: { type:'raw', value: { nodes, links } } }` — normalise to `{ ts, value: { nodes, links } }`; if none → 404 `{ error: 'no snapshot' }`.
- `POST /api/network/refresh` → `triggerManualRefresh()`; rate-limited → 429; in-flight → 409; success → await the request and return `{ ok }`.
- `GET /api/health` → `{ mqttConnected, lastSampleAt, lastSnapshotAt }` from `runtimeStatus` (ISO strings or null).
- Serve `public/` statically; `GET /` → `public/index.html`. Non-existent `public/` tolerated at build time (task 06 delivers it).

## Wiring in `src/index.ts`

Order: `startBatchWriter()` → `startCollectors()` → `startNetworkmapScheduler()` → `startRetentionJob()` → `startApi()`. Graceful `SIGINT`/`SIGTERM`: stop writer (flush), end MQTT client, `closeDb()`, exit 0.

## Acceptance criteria

- `npm run build` passes; endpoints return 400/404/429 correctly for edge inputs (spot-check against a quick manual JSON mock if MQTT isn't reachable — the API must not crash when MQTT is down).
- Mark checkbox in `tasks/README.md`.
