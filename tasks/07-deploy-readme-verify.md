# 07 — Docker + README + final verification

**Depends on:** 01–06. Read `/instruction.md` §9–11 first.

## Step 1 — Dockerfile + docker-compose.yml

`Dockerfile` (at repo root):
- `node:22-alpine`; copy `package*.json`, `npm ci`, copy sources, `npm run build`, `CMD ["node","dist/index.js"]`; create `/app/data` volume path; `EXPOSE 8080`.

`docker-compose.yml` example (spec §9):
```yaml
services:
  mesh-health:
    build: .
    ports: ["8080:8080"]
    volumes: ["./data:/app/data"]
    environment:
      MQTT_HOST: localhost
      MQTT_PORT: "1883"
      Z2M_BASE_TOPIC: zigbee2mqtt
      NETWORKMAP_SCHEDULE: "04:00"
      LQI_WARNING_THRESHOLD_PCT: "20"
      LQI_CRITICAL_ABSOLUTE: "50"
      ROUTE_FAILURE_CRITICAL_COUNT: "5"
      RETENTION_DAYS: "30"
      # MQTT_USERNAME, MQTT_PASSWORD, API_KEY optional
```

## Step 2 — README.md (spec §11 deliverable 6)

Cover in order:
1. **What it does** — 1–2 sentences; monitoring Zigbee mesh health passively.
2. **The three data channels** — passive LQI on `<base>/+`; rare networkmap; bridge logging/info events. Explicitly explain **why** the networkmap must be rare (§2: active LQI scan hammers radio; 1–2/day max; this app defaults to 1/day + a manual trigger rate-limited to 1/hour).
3. **Configuration table** — every env var from task 01 with default values and meaning of each alert threshold.
4. **Endpoints** — summary table of the 6 API routes.
5. **Run locally** — `npm ci && npm run build && npm start`; **Docker** — `docker compose up -d`.
6. **Threshold tuning pointers** (warning vs critical logic recap).

## Step 3 — Final verification (blocking checklist)

- [ ] Checkbox items 01–06 in `tasks/README.md` are all `[x]`.
- [ ] `npm ci && npm run build` clean.
- [ ] Smoke test: start the service with `MQTT_HOST=localhost` (broker unreachable is OK — it must not crash); `GET /api/health` returns 200 with `mqttConnected:false`; static `/` serves the frontend; `POST /api/network/refresh` returns 429-appropriate/ok-with-timeout error object, not an exception; then kill.
- [ ] `instruction.md` deliverables 1–6 all present; no scope creep (no ML, no push notifications, no multi-network, no multi-user auth).
- [ ] Mark your own checkbox in `tasks/README.md`.
