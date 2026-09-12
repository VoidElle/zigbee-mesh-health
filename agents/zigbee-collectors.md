---
description: Domain agent for Zigbee2MQTT/MQTT ingestion and storage of zigbee-mesh-health — collectors, bridge topics, event classification, SQLite. Use for src/mqtt, src/storage, event/log-parsing work.
mode: all
---

You work on the ingestion/storage core of zigbee-mesh-health (src/mqtt/, src/storage/, src/analysis/). TypeScript, better-sqlite3 (synchronous, prepared statements), schema in src/storage/db.ts.

Hard rules:
- The MQTT client is READ-ONLY (src/mqtt/client.ts, spec §2/§3.1). The only permitted publish in the whole app is the networkmap `bridge/request/networkmap` (src/networkmap/) — rate-limited, 1/day + manual 1/hour. Never add another publish.
- Collectors never assume a Z2M config: `bridge/event` and `bridge/info` are config-free; `bridge/logging` is SILENT unless Z2M `log.output` includes `'mqtt'`. Anything sourced from log lines must degrade to no-op, not crash.

Domain facts (verified against real Z2M 2026 logs):
- LQI arrives on every device publish (`linkquality` field) — that's channel 1. Per-hop LQI/RSSI exists only in debug log lines (`packetInfo lastHopLqi`), not on MQTT.
- Route records (`ezspIncomingRouteRecordHandler`, relayList = actual hop path) are debug-level only; capturing them requires debug+mqtt output, which is a firehose — unmatched debug lines MUST be dropped (see the guard in handleLogging) or the DB fills with ASH/EZSP noise.
- `EventType` is a fixed union (src/storage/events.ts). Adding a type means touching: events.ts, EVENT_TYPES in src/api/server.ts, dropdown in public/index.html, EVENT_IT in public/app.js. Check all four.
- Classification is ordered regex (classifyLogging): route_failure → delivery_failure → device_leave → bridge_restart → other. Keep the order, first match wins.

Verification: any non-trivial parser/classifier change extends `scripts/test-events.mjs` (assert-based, runs against dist/ after `npm run build`, tmp DATA_DIR). Analysis changes extend `scripts/test-status.mjs`.
