import * as fs from 'fs';
import * as path from 'path';

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}=${raw}: expected number`);
  return n;
}

function strEnv(name: string, def: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? def : raw;
}

function optEnv(name: string): string | undefined {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? undefined : raw;
}

// MQTT_HOST — MQTT broker host (default "localhost")
const mqttHost = strEnv('MQTT_HOST', 'localhost');
// MQTT_PORT — MQTT broker port (default 1883)
const mqttPort = intEnv('MQTT_PORT', 1883);
// MQTT_USERNAME / MQTT_PASSWORD — optional broker credentials (disabled when empty)
const mqttUsername = optEnv('MQTT_USERNAME');
const mqttPassword = optEnv('MQTT_PASSWORD');
// Z2M_BASE_TOPIC — Zigbee2MQTT base topic (default "zigbee2mqtt")
const baseTopic = strEnv('Z2M_BASE_TOPIC', 'zigbee2mqtt');
// HTTP_PORT — Express API port (default 8080)
const httpPort = intEnv('HTTP_PORT', 8080);
// DATA_DIR — directory for SQLite file (default "./data")
const dataDir = strEnv('DATA_DIR', './data');
// NETWORKMAP_SCHEDULE — daily networkmap time, "HH:MM" (default "04:00")
const networkmapSchedule = strEnv('NETWORKMAP_SCHEDULE', '04:00');
// NETWORKMAP_TIMEOUT_MS — networkmap response timeout (default 180000 = 3 min)
const networkmapTimeoutMs = intEnv('NETWORKMAP_TIMEOUT_MS', 180000);
// LQI_WARNING_THRESHOLD_PCT — warning when 24h avg < 7d avg by this % (default 20)
const warningThresholdPct = intEnv('LQI_WARNING_THRESHOLD_PCT', 20);
// LQI_CRITICAL_ABSOLUTE — critical when 24h avg below this LQI (default 50)
const criticalAbsolute = intEnv('LQI_CRITICAL_ABSOLUTE', 50);
// ROUTE_FAILURE_CRITICAL_COUNT — critical when this many route/delivery failures in 24h (default 5)
const routeFailureCriticalCount = intEnv('ROUTE_FAILURE_CRITICAL_COUNT', 5);
// RETENTION_DAYS — raw LQI samples older than this are aggregated+deleted (default 30)
const retentionDays = intEnv('RETENTION_DAYS', 30);
// API_KEY — optional API key; auth disabled when empty
const apiKey = optEnv('API_KEY');
// FLUSH_INTERVAL_MS — sample buffer flush interval (default 10000 = 10s)
const flushIntervalMs = intEnv('FLUSH_INTERVAL_MS', 10000);
// FLUSH_BATCH_SIZE — flush when buffer reaches this many samples (default 100)
const flushBatchSize = intEnv('FLUSH_BATCH_SIZE', 100);

export const config = {
  mqttHost,
  mqttPort,
  ...(mqttUsername !== undefined ? { mqttUsername } : {}),
  ...(mqttPassword !== undefined ? { mqttPassword } : {}),
  baseTopic,
  httpPort,
  dataDir,
  networkmapSchedule,
  networkmapTimeoutMs,
  warningThresholdPct,
  criticalAbsolute,
  routeFailureCriticalCount,
  retentionDays,
  ...(apiKey !== undefined ? { apiKey } : {}),
  flushIntervalMs,
  flushBatchSize,
};

// Ensure the SQLite data directory exists (called lazily by db.ts on first open).
export function ensureDataDir(): string {
  const abs = path.resolve(config.dataDir);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

// Absolute path to the SQLite file. Single source of truth for the filename;
// client.ts builds the Prisma driver-adapter URL from it.
export function dbFile(): string {
  return path.join(ensureDataDir(), 'mesh-health.db');
}
