# Task 09 — Infrastructure: HTTP adapter (Express + SSE)

**Depends on:** task 08.
**Touches:** `infrastructure/http/Sse.ts`, `infrastructure/http/ExpressServer.ts`;
shim for `src/api/server.ts`.

## Goal

Move the Express API into an HTTP adapter that depends on application use cases
via injected functions, not on repositories directly. Route behavior, status
codes and JSON bodies must stay identical.

## Files to create

### `src/infrastructure/http/Sse.ts`

Move the `sse()` helper (`src/api/server.ts:41-56`) verbatim: headers, initial
`: connected` comment, `data: 1` per bus emission, 25s heartbeat, cleanup on
`req.close`. Inputs: `EventBus` and event name.

### `src/infrastructure/http/ExpressServer.ts`

Move `src/api/server.ts`. Replace every direct repository/analysis import with an
injected dependency object; keep parsing/validation in the adapter:

- `RANGES`, `EVENT_TYPES`, `parseSince`, `queryStr` stay here (HTTP concerns).
- `startApi()` unchanged signature; reads `config`, guards with `config.apiKey`.
- Routes map to use cases:
  - `GET /api/devices` → `queryDevices()`
  - `PUT /api/devices/:name/alias` → `listDeviceNames()` + validation + `setAlias()`
  - `GET /api/devices/:name/history` → validate range/name + `history(name, ms)`
  - `GET /api/mesh/history` → `meshHistory(ms)`
  - `GET /api/events` → validate type/limit/since + `listEvents(...)`
  - `GET /api/events/stream`, `GET /api/samples/stream` → `sse(...)`
  - `GET /api/network/latest` → `getLatestSnapshot()` + the same JSON unwrap
  - `POST /api/network/refresh` → `triggerManualRefresh()` with identical
    429/409/503 mapping
  - `GET /api/health` → `getHealthStatus()` mapped to ISO strings
  - static `public/`, root 404, error middleware, `app.listen(config.httpPort)`
  All `[api]` logs unchanged.

```ts
export function createHttpServer(deps: {
  config: AppConfig;
  eventBus: EventBus;
  sampleBus: EventBus;
  queryDevices(): Promise<...>;
  listDeviceNames(): Promise<string[]>;
  setAlias(name: string, alias: string | null): Promise<void>;
  history(...): ...;
  meshHistory(...): ...;
  listEvents(...): ...;
  getLatestSnapshot(): ...;
  triggerManualRefresh(): ManualRefreshResult;
  getHealthStatus(): RuntimeStatusSnapshot;
}): { start(): void }
```

Keep a named export `startApi` bound in the shim so `composition/main.ts` and
tests are unaffected.

## Shims

```ts
// src/api/server.ts  (temporary)
export * from '../infrastructure/http/public-api';
```

`src/infrastructure/http/public-api.ts` binds `startApi` to the container.

## Verify

- `npm run build` exits 0.
- `npm test` green. `test/api.test.mjs` runs the compiled `dist/index.js` and
  compares every endpoint against golden fixtures — this is the primary guard.
  Any diff means the adapter diverged; fix the adapter, never the fixture.

## Done when

HTTP is a thin adapter over application use cases, golden fixtures all match.
