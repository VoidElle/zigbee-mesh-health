# 02 — MQTT collectors (passive LQI + bridge events)

**Depends on:** 01 (uses `config`, `runtimeStatus`, storage exports). Read `/instruction.md` §3.1, §3.3 first.

## Goal

Implement channels 1 and 3: passive link-quality collection and Z2M log/event ingestion. **Zero active traffic** — you only subscribe and listen (§2 of the spec is critical: the networkmap channel belongs to task 03, not here).

## Files

- `src/mqtt/client.ts` — singleton MQTT client: connect with auth from `config`, set `runtimeStatus.mqttConnected` on `connect`/`reconnect`/`close`/`offline` events; export `getClient(): mqtt.MqttClient`.
- `src/mqtt/lqiCollector.ts` — channel 1.
- `src/mqtt/eventCollector.ts` — channel 3.
- `src/mqtt/index.ts` — `export function startCollectors(): void` (task 05 wires this).

## Channel 1 — passive LQI (spec §3.1)

- Subscribe to `<baseTopic>/+`.
- On message: skip any topic whose segment after baseTopic is `bridge` (bridge topics go to channel 3).
- Parse payload as JSON; if numeric `linkquality` present → `friendly_name` = last topic segment; `enqueueSample(friendlyName, payload.ieee_address ?? null, linkquality)`; update `runtimeStatus.lastSampleAt`.

## Channel 3 — bridge logging + info (spec §3.3)

- Subscribe to `<baseTopic>/bridge/logging` and `<baseTopic>/bridge/info`.
- Classify `logging` lines by heuristic keywords into `EventType`: route/route failure → `route_failure`; delivery/publish errors and `level==='error'` → `delivery_failure`, plus `route_failure` (tighten keywords so failures are separated); "left the network"/leave → `device_leave`; "restart"/"starting"/shutdown → `bridge_restart`; otherwise `other`.
- From `bridge/info`: compare coordinator/Z2M versions to previous seen (keep in-memory); on change insert `version_change` with the old→new in message. Best-effort device name extraction; message = original log line.

## Constraints

- Never publish anything on MQTT in this module.
- Keep classification documented in code comments; unknowns land in `other`, not dropped.

## Acceptance criteria

- `npm run build` passes.
- Task 01 checkbox was checked before you started; you must NOT modify `package.json` or storage files.
- Mark checkbox in `tasks/README.md`.
