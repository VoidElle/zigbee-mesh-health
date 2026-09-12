# zigbee-mesh-health

Passive LQI and routing-health monitor for Zigbee2MQTT — tracks link quality over time and flags degrading devices before they fail, **without adding extra radio traffic** to your mesh.

## What it does

A small self-hosted Node.js service that subscribes to your Zigbee2MQTT broker, stores every `linkquality` value devices already publish, records bridge events (route failures, leaves, restarts, version changes), and serves a dashboard with per-device LQI trends, alert states, a network map, and an event log. SQLite storage, zero cloud dependencies.

## The three data channels

| # | Channel | Frequency | Cost |
|---|---------|-----------|------|
| 1 | **Passive LQI** — subscribes `<base_topic>/+`, extracts `linkquality` from normal device messages | continuous | zero extra radio traffic |
| 2 | **Networkmap** — publishes `bridge/request/networkmap` with payload `"raw"` | 1/day scheduled (default 04:00) + manual trigger rate-limited to 1/hour | heavy |
| 3 | **Bridge events** — subscribes `bridge/event` (device leaves/joins/announces), `bridge/logging` (route/delivery failures, restarts) and `bridge/info` (version/coordinator changes) | continuous | negligible |

**Why the networkmap must be rare:** it runs an *active* LQI scan — the coordinator interrogates every router on the mesh in sequence, generating additional radio traffic, and can take minutes with partial failures on unstable networks. Hammering it degrades the very network you're monitoring. That's why this app hard-caps it: one scheduled scan per day, no retry-on-timeout (the next scheduled run retries), and a server-side rate limit of minimum 1 hour between manual triggers. The manual trigger consumes the rate-limit window even when it fails, so a broken bridge can't be hammered. The snapshot is used only for the map view, never as a source for the continuous trend.

**Getting log-based events:** Zigbee2MQTT publishes its log to `bridge/logging` only when its config includes mqtt in the output — `log: { output: ['console', 'file', 'mqtt'] }`; with the default output the topic stays silent, and only `bridge/event` and `bridge/info` events are recorded. Unmatched debug-level log lines are ignored, so enabling `log_level: debug` alongside mqtt output does not flood the event log.

## Configuration

All via environment variables:

| Variable | Default | Meaning |
|----------|---------|---------|
| `MQTT_HOST` | `localhost` | MQTT broker host |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | *(empty = disabled)* | Broker credentials, if required |
| `Z2M_BASE_TOPIC` | `zigbee2mqtt` | Zigbee2MQTT base topic |
| `HTTP_PORT` | `8080` | Express API/UI port |
| `DATA_DIR` | `./data` | Directory for the SQLite file |
| `NETWORKMAP_SCHEDULE` | `04:00` | Daily networkmap time, `HH:MM` (pick a low-traffic hour) |
| `NETWORKMAP_TIMEOUT_MS` | `180000` | Wait before giving up on a networkmap response (no retry — next schedule retries) |
| `LQI_WARNING_THRESHOLD_PCT` | `20` | **Warning** when the 24h average LQI drops more than this % below the 7-day average (device is degrading) |
| `LQI_CRITICAL_ABSOLUTE` | `50` | **Critical** when the 24h average LQI falls below this absolute value (link nearly dead) |
| `ROUTE_FAILURE_CRITICAL_COUNT` | `5` | **Critical** when a device has this many route/delivery failures in the last 24h |
| `RETENTION_DAYS` | `30` | Raw LQI samples older than this are aggregated into daily min/max/avg per device, then deleted |
| `API_KEY` | *(empty = disabled)* | When set, `/api/*` requires `Authorization: Bearer <key>` or `x-api-key` header |
| `FLUSH_INTERVAL_MS` | `10000` | LQI samples are buffered in memory and flushed to SQLite every this many ms |
| `FLUSH_BATCH_SIZE` | `100` | ...or when this many samples are buffered, whichever comes first |

## API endpoints

| Route | Description |
|-------|-------------|
| `GET /api/devices` | Known devices with current LQI and alert state (`ok` / `warning` / `critical`) |
| `GET /api/devices/{name}/history?range=24h\|7d\|30d` | LQI time series for one device |
| `GET /api/mesh/history?range=24h\|7d\|30d` | Mesh-wide average LQI over time (~96 buckets) |
| `GET /api/events?type=&since=` | Event log, filterable by type and time window (`24h`/`7d`/`30d` or ISO date) |
| `GET /api/network/latest` | Last networkmap snapshot (404 until the first scan completes) |
| `POST /api/network/refresh` | Manual networkmap trigger — rate-limited to 1/hour (429 if too soon, 409 if one is in flight) |
| `GET /api/health` | Service status: MQTT connection, last sample, last snapshot |

The web UI is served from the same process at `/`.

## Run locally

```bash
npm ci
npm run build
npm start   # or: node dist/index.js
```

Point `MQTT_HOST`/`MQTT_PORT` at your broker (Zigbee2MQTT must be publishing to it), then open http://localhost:8080.

### Development

Design tokens/theme/base live in `src/styles/tailwind.css`; utility classes go in `public/index.html` and `public/app.js`. After editing either, regenerate the served stylesheet:

```bash
npm run css        # or: npm run css:watch
```

`public/styles.css` is generated and committed — include the regenerated file in your commit.

## Docker

```bash
docker compose up -d
```

The compose file mounts `./data` for persistent SQLite storage and exposes port 8080. Set `MQTT_HOST` to your broker's address as seen from the container (e.g. `host.docker.internal` if the broker runs on the Docker host, or your broker's LAN IP / container name).

## Home Assistant add-on

This repo doubles as an **add-on repository**. Two ways to install:

**A. From the published repository (prebuilt images):**
1. HA UI: *Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories* → add `https://github.com/VoidElle/zigbee-mesh-health`.
2. Refresh the store → **Zigbee Mesh Health** appears → **Install**. Prebuilt multi-arch images (aarch64/amd64/armv7/i386) are pulled from GHCR, so nothing is compiled on the HA box.
3. Start the Mosquitto broker add-on (or use an external broker — see options), set options on the add-on **Configuration** tab, then **Start**. The **Log** should show `Starting zigbee-mesh-health (broker ...)`.

**B. Local repository (no GHCR needed):**
1. Clone this repo on the HA host (HAOS: via the SSH/Samba add-on, e.g. to `/addons/zigbee-mesh-health`; Container: next to the HA config dir).
2. Remove the `image:` line from `addon/config.yaml` — otherwise the store tries to pull from GHCR.
3. Add the **full local path** to the cloned repo (the directory containing `repository.yaml`) under *Repositories*, refresh, install. The image is built on the HA machine itself — takes minutes on ARM due to better-sqlite3.

The dashboard opens from the HA sidebar as **Zigbee Mesh Health** (ingress — authenticated with your HA login, no extra credentials or exposed ports). All options are documented in [`addon/DOCS.md`](addon/DOCS.md); leave `mqtt_host` empty to auto-discover the Mosquitto broker add-on.

**Releasing (version single-source rule):** a release is a git tag. Pushing a tag like `v1.0.0` triggers the [add-on workflow](.github/workflows/addon.yml), which builds all four arches and publishes them tagged with the `version:` from `addon/config.yaml` (plus `latest`). So before tagging, bump `version` in `addon/config.yaml` **and** `version` in `package.json` — keep the two and the tag in sync. GHCR packages must be set to **public** once (GitHub → Packages → the image → Package settings) or installs will fail with pull errors.

## Tuning the alert thresholds

- **Warning (trend-based):** fires when `avg(24h) < avg(7d) × (1 − LQI_WARNING_THRESHOLD_PCT/100)`. Catches slow degradation — a device whose link is getting worse day by day. Lower the % for earlier warning, raise it to reduce noise.
- **Critical (absolute):** fires when `avg(24h) < LQI_CRITICAL_ABSOLUTE` — the link is nearly unusable now. LQI is 0–255; 50 is a weak link, 100+ is healthy.
- **Critical (failures):** fires when a device logs `ROUTE_FAILURE_CRITICAL_COUNT` route/delivery failures in 24h — the mesh is actively struggling to reach it, even if LQI still looks acceptable.

Check the events view to correlate a degradation with a `bridge_restart` or `version_change` (firmware/Z2M update) before swapping hardware.
