# 08 — Home Assistant add-on: scaffold (config.yaml, Dockerfile, run.sh)

**Depends on:** 07. Add-on files live in a new `addon/` directory at repo root. Root `Dockerfile`/`docker-compose.yml` stay untouched for standalone users. Do not modify `src/`.

## Step 1 — `addon/config.yaml`

Home Assistant add-on manifest. Options map to `/data/options.json` (read by `run.sh`, Step 3). MQTT broker comes from the HA service connection when the explicit `mqtt_*` options are empty.

```yaml
name: Zigbee Mesh Health
version: "1.0.0"          # keep in sync with package.json version
slug: zigbee_mesh_health
description: Passive LQI and routing-health monitor for Zigbee2MQTT meshes
url: https://github.com/lucadelc/zigbee-mesh-health
arch: ["aarch64", "amd64", "armv7", "i386"]
startup: services
boot: auto
init: false
services:
  - mqtt:want
ingress: true
ingress_port: 8080
panel_icon: mdi:zigbee
panel_title: Zigbee Mesh Health
ports:
  8080/tcp: null          # disabled by default; user can map it for direct API access
ports_description:
  8080/tcp: Direct API/UI access (optional — set an API key if you enable this)
options:
  base_topic: zigbee2mqtt
  networkmap_schedule: "04:00"
  lqi_warning_threshold_pct: 20
  lqi_critical_absolute: 50
  route_failure_critical_count: 5
  retention_days: 30
  api_key: ""
  mqtt_host: ""
  mqtt_port: 1883
  mqtt_username: ""
  mqtt_password: ""
schema:
  base_topic: str
  networkmap_schedule: match(^([01]\d|2[0-3]):[0-5]\d$)
  lqi_warning_threshold_pct: int(0,100)
  lqi_critical_absolute: int(0,255)
  route_failure_critical_count: int(1,100)
  retention_days: int(1,365)
  api_key: str?
  mqtt_host: str?
  mqtt_port: port?
  mqtt_username: str?
  mqtt_password: str?
```

Notes:
- `ingress: true` + `ingress_port: 8080` → the app is reachable from the HA sidebar with HA authentication; no API key needed for ingress traffic.
- `mqtt:want` (not `need`) → add-on also works with an external broker via `mqtt_host`.
- `/data` is persistent in HA add-ons by default → `DATA_DIR=/data`, SQLite survives restarts and is included in HA backups. No `map:` needed.

## Step 2 — `addon/build.yaml` + `addon/Dockerfile`

`addon/build.yaml` (base images for the HA builder):
```yaml
build_from:
  aarch64: ghcr.io/home-assistant/aarch64-base:3.20
  amd64: ghcr.io/home-assistant/amd64-base:3.20
  armv7: ghcr.io/home-assistant/armv7-base:3.20
  i386: ghcr.io/home-assistant/i386-base:3.20
```

`addon/Dockerfile` — same build as the root Dockerfile but HA-style base and entrypoint:
```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

# node + build tools for better-sqlite3 (musl has no prebuilt binaries)
RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
COPY public ./public

COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
```

Verify the Alpine 3.20 `nodejs` version is ≥ 20; if not, pin `nodejs~<version>` from Alpine packages.

Also add `addon/.dockerignore` mirroring the root one (`node_modules`, `dist`, `data`, `.git`, `.idea`, `.DS_Store`, `tasks`).

## Step 3 — `addon/run.sh`

Translate `/data/options.json` to env vars with bashio. Broker resolution order: explicit `mqtt_host` option → HA MQTT service → fail with a clear message.

```bash
#!/usr/bin/with-contenv bashio

export DATA_DIR=/data

# Broker: explicit options win over the HA MQTT service
if bashio::config.has_value 'mqtt_host'; then
  export MQTT_HOST="$(bashio::config 'mqtt_host')"
  export MQTT_PORT="$(bashio::config 'mqtt_port')"
  bashio::config.has_value 'mqtt_username' && export MQTT_USERNAME="$(bashio::config 'mqtt_username')"
  bashio::config.has_value 'mqtt_password' && export MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
elif bashio::services.available "mqtt"; then
  export MQTT_HOST="$(bashio::services 'mqtt' 'host')"
  export MQTT_PORT="$(bashio::services 'mqtt' 'port')"
  export MQTT_USERNAME="$(bashio::services 'mqtt' 'username')"
  export MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
else
  bashio::exit.nok "No MQTT broker: connect the Mosquitto broker add-on or set mqtt_host"
fi

export Z2M_BASE_TOPIC="$(bashio::config 'base_topic')"
export NETWORKMAP_SCHEDULE="$(bashio::config 'networkmap_schedule')"
export LQI_WARNING_THRESHOLD_PCT="$(bashio::config 'lqi_warning_threshold_pct')"
export LQI_CRITICAL_ABSOLUTE="$(bashio::config 'lqi_critical_absolute')"
export ROUTE_FAILURE_CRITICAL_COUNT="$(bashio::config 'route_failure_critical_count')"
export RETENTION_DAYS="$(bashio::config 'retention_days')"
export HTTP_PORT=8080   # must equal ingress_port in config.yaml

bashio::config.has_value 'api_key' && export API_KEY="$(bashio::config 'api_key')"

bashio::log.info "Starting zigbee-mesh-health (broker ${MQTT_HOST}:${MQTT_PORT}, topic ${Z2M_BASE_TOPIC})"
exec node dist/index.js
```

## Step 4 — Ignore + validation

- Add `addon/data/` (if any local testing creates it) to `.gitignore` if needed — do NOT ignore `addon/` itself.

## Acceptance criteria

- [ ] `docker build --build-arg BUILD_FROM=node:22-alpine -f addon/Dockerfile addon/` succeeds.
- [ ] `bashio` syntax of `run.sh` matches current bashio API (`bashio::config.has_value`, `bashio::services.available`, `bashio::services 'mqtt' '<key>'`, `bashio::exit.nok`).
- [ ] `config.yaml` passes the HA add-on schema (options/schema keys match, `slug` is unique, version matches `package.json`).
- [ ] Container starts with the run.sh contract: `DATA_DIR=/data`, `HTTP_PORT=8080`, broker env either from options or service.
- [ ] `npm run build` at repo root still passes (no `src/` changes).
- [ ] Mark your checkbox in `tasks/README.md`.
