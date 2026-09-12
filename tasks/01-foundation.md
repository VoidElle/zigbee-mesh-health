# 01 — Foundation: config + storage

**Blocking-first task.** Everything else depends on this. Read `/instruction.md` first.

## Goal

Set up npm dependencies and the shared foundation every other task consumes: env config, SQLite schema, batch writer, retention helpers, runtime status. You implement exactly the "Cross-task interface contract" declared in `tasks/README.md`.

## Step 1 — Install dependencies (owned by this task; no other task touches package.json)

```bash
npm install mqtt better-sqlite3 express node-cron
npm install -D @types/express @types/node @types/node-cron @types/better-sqlite3
```

## Step 2 — `src/config.ts`

Parse env vars into typed `config` (see contract in README). Defaults (document each with a comment):

| Env var | Default |
|---|---|
| `MQTT_HOST` | `localhost` |
| `MQTT_PORT` | `1883` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | optional |
| `Z2M_BASE_TOPIC` | `zigbee2mqtt` |
| `HTTP_PORT` | `8080` |
| `DATA_DIR` | `./data` |
| `NETWORKMAP_SCHEDULE` | `04:00` (daily, `HH:MM`) |
| `NETWORKMAP_TIMEOUT_MS` | `180000` (3 min) |
| `LQI_WARNING_THRESHOLD_PCT` | `20` |
| `LQI_CRITICAL_ABSOLUTE` | `50` |
| `ROUTE_FAILURE_CRITICAL_COUNT` | `5` |
| `RETENTION_DAYS` | `30` |
| `API_KEY` | optional / disabled when empty |
| `FLUSH_INTERVAL_MS` | `10000` |
| `FLUSH_BATCH_SIZE` | `100` |

Ensure `dataDir` is created (mkdir recursive) on first use in `db.ts`.

## Step 3 — `src/storage/db.ts`

`getDb()` singleton: better-sqlite3 opened at `<dataDir>/mesh-health.db`, WAL journal mode, `CREATE TABLE IF NOT EXISTS` the schema from `instruction.md` §4 **plus**:

```sql
CREATE TABLE IF NOT EXISTS linkquality_daily_summary (
  device_name TEXT NOT NULL,
  day TEXT NOT NULL,        -- YYYY-MM-DD
  min_lqi INTEGER,
  max_lqi INTEGER,
  avg_lqi REAL,
  sample_count INTEGER,
  PRIMARY KEY (device_name, day)
);
```
Export `closeDb()` for graceful shutdown.

## Step 4 — `src/storage/samples.ts`

Batch writer (spec §3.1): in-memory buffer, flush every `config.flushIntervalMs` or when buffer reaches `config.flushBatchSize`; `startBatchWriter()` starts the interval, `stopBatchWriter()` flushes before clearing; `enqueueSample(...)` buffers. On flush, use a single transaction.

Query helpers:
- `latestLqiPerDevice()` — latest sample per device (name, ieee, lqi, ts).
- `history(device, sinceMs)` — rows of `{ lqi, ts }` for `ts >= now - sinceMs`, also from `linkquality_daily_summary` when query range spans beyond retention (optional simplification: raw table only; document the choice).
- `listDeviceNames()` — distinct names from samples.

## Step 5 — `src/storage/events.ts` & `src/storage/snapshots.ts`

Straight inserts/queries per contract. `listEvents` supports optional `type`, `sinceMs`, `limit` (default 200), newest first. `getLatestSnapshot()` returns `{ ts, raw_json }` of most recent row or null.

## Step 6 — `src/storage/retention.ts`

`runRetentionOnce()`: for samples older than `config.retentionDays`, group by device+day within a transaction → upsert into `linkquality_daily_summary` (recompute min/max/avg/count for that day) → delete those raw rows. `startRetentionJob()`: run once at start, then daily via `setInterval` (24h). Unref timer so it doesn't block exit.

## Step 7 — `src/runtime.ts`

Mutable singleton `runtimeStatus` (see contract) — the collectors and networkmap manager update it; `/api/health` reads it.

## Acceptance criteria

- `npm run build` passes; `npm install` works.
- Unit-style sanity: `tsconfig` unchanged; verify `getDb()`, `enqueueSample` + `flushSamples`, `insertEvent`, `insertSnapshot`, `runRetentionOnce` compile and behave with a quick throwaway script (`node -e "..."` against `dist/...` or a temporary `src/tmp-check.ts` deleted afterwards).
- Mark checkbox in `tasks/README.md` as done.
