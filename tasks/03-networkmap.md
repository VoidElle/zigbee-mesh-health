# 03 — Networkmap manager (scheduler + manual trigger)

**Depends on:** 01; imports `getClient()` from `src/mqtt/client.ts` (task 02's export). Read `/instruction.md` §2 and §3.2 first — §2 is a hard constraint.

## Goal

Channel 2: the rare, isolated, schedulable network map request. This is the ONLY place in the codebase allowed to publish `zigbee2mqtt/bridge/request/networkmap`. Put a loud comment at the top of the module quoting §2 (max 1–2/day, never frequent polling).

## Files

- `src/networkmap/index.ts` with:
  - `export function startNetworkmapScheduler(): void`
  - `export function requestNetworkMap(forceManual?: boolean): Promise<{ ok: boolean; error?: string }>`
  - `export function triggerManualRefresh(): { ok: boolean; error?: string }` (sync, rate-limit checked at call time; responds via promise internally)

## Behaviour (spec §3.2)

- `node-cron` daily schedule from `config.networkmapSchedule` (`HH:MM` → cron `M H * * *`; validate/parse with fallback to 04:00).
- Request: publish payload `"raw"` to `<baseTopic>/bridge/request/networkmap`, then wait for a message on `<baseTopic>/bridge/response/networkmap` (subscribe once at module init).
- Timeout: `config.networkmapTimeoutMs` (default 3 min). On timeout: log failure, resolve `{ok:false,- error:'timeout'}` — **do not retry immediately**; next scheduled run will retry.
- On response: `insertSnapshot(JSON.stringify(parsed))`, update `runtimeStatus.lastSnapshotAt`.
- Manual trigger: rejects if less than **1 hour** since the last *manual* trigger (server-side rate limit), returning `{ok:false, error:'rate_limited', ...}`.
- Concurrency guard: if a request is in-flight, reject a second one (`{ok:false, error:'in_flight'}`).

## Acceptance criteria

- `npm run build` passes.
- No file outside `src/networkmap/` modified (except imports from 01/02 exports).
- Mark checkbox in `tasks/README.md`.
