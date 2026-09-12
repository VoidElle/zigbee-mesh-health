// Replay the HTTP API of a built app against a seeded DB and write golden JSON.
//   node scripts/fixtures/replay.mjs <repoDir> <dataDir> <outDir> <port>
// The repoDir must contain dist/index.js (run `npm run build` there first).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const [repoDir, dataDir, outDir, portArg] = process.argv.slice(2);
const port = Number(portArg || 8099);
if (!repoDir || !dataDir || !outDir) {
  console.error('usage: replay.mjs <repoDir> <dataDir> <outDir> <port>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const endpoints = [
  ['devices', '/api/devices'],
  ['device-history-24h', '/api/devices/Luce/history?range=24h'],
  ['device-history-7d', '/api/devices/Luce/history?range=7d'],
  ['device-history-30d', '/api/devices/Luce/history?range=30d'],
  ['device-history-missing', '/api/devices/Nope/history?range=24h'],
  ['device-history-badrange', '/api/devices/Luce/history?range=1h'],
  ['mesh-history-24h', '/api/mesh/history?range=24h'],
  ['mesh-history-7d', '/api/mesh/history?range=7d'],
  ['mesh-history-30d', '/api/mesh/history?range=30d'],
  ['events-default', '/api/events'],
  ['events-route_failure', '/api/events?type=route_failure'],
  ['events-device_leave', '/api/events?type=device_leave'],
  ['events-since-24h', '/api/events?since=24h'],
  ['events-since-7d', '/api/events?since=7d'],
  ['events-limit-3', '/api/events?limit=3'],
  ['events-type-limit', '/api/events?type=route_failure&limit=2'],
  ['events-bogus-type', '/api/events?type=bogus'],
  ['network-latest', '/api/network/latest'],
  ['health', '/api/health'],
  ['unknown', '/api/nope'],
];

const env = {
  ...process.env,
  DATA_DIR: dataDir,
  HTTP_PORT: String(port),
  MQTT_HOST: '127.0.0.1',
  MQTT_PORT: '18999',
  // Keep retention from mutating the fixture under the API replay.
  RETENTION_DAYS: '100000',
};
const child = spawn('node', ['dist/index.js'], { cwd: repoDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
child.stdout.on('data', (d) => (serverLog += d));
child.stderr.on('data', (d) => (serverLog += d));

// Normalise ISO-8601 timestamps so a golden captured from one seed-time can be
// diffed against a later seed. Set NORMALIZE=1 (raw capture keeps real values).
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})/g;
const normalize = (v) => JSON.parse(JSON.stringify(v).replace(ISO, 'TS'));

const base = `http://127.0.0.1:${port}`;
async function waitReady() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`server not ready on :${port}\n${serverLog}`);
}

try {
  await waitReady();
  for (const [name, path] of endpoints) {
    const res = await fetch(base + path);
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const record = { status: res.status, body };
    const out = process.env.NORMALIZE === '1' ? normalize(record) : record;
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`captured ${endpoints.length} endpoints -> ${outDir}`);
} finally {
  child.kill('SIGKILL');
}
