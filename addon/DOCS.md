# Zigbee Mesh Health

Passive LQI and routing-health monitor for Zigbee2MQTT meshes — tracks link quality over time and flags degrading devices before they fail, **without adding extra radio traffic** to your mesh. Every `linkquality` value your devices already publish is stored and charted; bridge events (route failures, leaves, restarts, version changes) are logged so you can correlate a degradation with a firmware or Zigbee2MQTT update. SQLite storage, zero cloud dependencies.

## Why the network map is rare

The network map is the only *active* part of this add-on: it publishes `bridge/request/networkmap`, which makes the coordinator interrogate every router on the mesh in sequence — additional radio traffic, potentially minutes long, with partial failures on unstable networks. Hammering it degrades the very network you're monitoring. That's why it is hard-capped: **one scheduled scan per day** (default 04:00, a low-traffic hour — configurable), no retry-on-timeout (the next scheduled run retries), and a **server-side rate limit of minimum 1 hour between manual triggers**. The manual trigger consumes the rate-limit window even when it fails, so a broken bridge can't be hammered. Everything else — LQI trends, alert states, the event log — comes from passively listening to traffic that Zigbee2MQTT already publishes.

## Setup

Two ways to point the add-on at your broker:

1. **Mosquitto broker add-on (recommended):** install the official Mosquitto broker add-on and connect it to Zigbee2MQTT. Nothing to type here — service discovery picks host, port, and credentials automatically.
2. **External broker:** set `mqtt_host` / `mqtt_port` (and `mqtt_username` / `mqtt_password` if the broker requires them) in the add-on configuration. Explicit settings always win over the service.

Zigbee2MQTT must already be publishing to that broker, with the same `base_topic` on both sides.

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `mqtt_host` | *(empty)* | External MQTT broker host. Leave empty to use the connected Mosquitto broker add-on |
| `mqtt_port` | `1883` | External MQTT broker port |
| `mqtt_username` | *(empty)* | Broker username, if required |
| `mqtt_password` | *(empty)* | Broker password, if required |
| `base_topic` | `zigbee2mqtt` | Zigbee2MQTT base topic — must match Zigbee2MQTT's setting |
| `networkmap_schedule` | `04:00` | Daily network map scan time, `HH:MM` (pick a low-traffic hour) |
| `lqi_warning_threshold_pct` | `20` | **Warning** when the 24h average LQI drops more than this % below the 7-day average (device is degrading) |
| `lqi_critical_absolute` | `50` | **Critical** when the 24h average LQI falls below this absolute value (link nearly dead; LQI is 0–255) |
| `route_failure_critical_count` | `5` | **Critical** when a device has this many route/delivery failures in the last 24h |
| `retention_days` | `30` | Raw LQI samples older than this are aggregated into daily min/max/avg per device, then deleted |
| `api_key` | *(empty)* | When set, `/api/*` requires `Authorization: Bearer <key>` or `x-api-key` header |

Tuning the alerts: **warning** is trend-based — it fires when `avg(24h) < avg(7d) × (1 − lqi_warning_threshold_pct/100)`, catching slow, day-by-day degradation. Lower the % for earlier warning, raise it to reduce noise. **critical** is absolute (`avg(24h) < lqi_critical_absolute` — 50 is a weak link, 100+ is healthy) or failure-based (`route_failure_critical_count` failures in 24h — the mesh is actively struggling to reach the device even if LQI still looks acceptable).

## Access

The dashboard is available in Home Assistant's sidebar as **Zigbee Mesh Health** — served via ingress, so it is authenticated with your Home Assistant login and needs no extra credentials or exposed ports.

Optionally, you can also expose the web UI/API directly on your LAN: enable the `8080/tcp` port mapping in the add-on configuration and **set an `api_key` first** — without it, anyone who can reach the port can read your mesh data and trigger network scans. Ingress access is unaffected and never needs the key.

## Data & backups

All history lives in a single SQLite file in the add-on's `/data` directory, which Home Assistant includes in backups automatically. Retention is automatic: raw LQI samples older than `retention_days` (default 30) are aggregated into daily min/max/avg per device and then deleted, so the database stays bounded. Events and network snapshots are kept indefinitely (they're tiny).
