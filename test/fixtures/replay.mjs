// Replay the HTTP API of a built app against a seeded DB and write golden JSON.
//   node test/fixtures/replay.mjs <repoDir> <dataDir> <outDir> <port>
// The repoDir must contain dist/index.js (run `npm run build` there first).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { endpoints } from './endpoints.mjs';
import { normalizeTimestamps } from '../helpers.mjs';

const [repoDir, dataDir, outDir, portArg] = process.argv.slice(2);
const port = Number(portArg || 8099);
if (!repoDir || !dataDir || !outDir) {
  console.error('usage: replay.mjs <repoDir> <dataDir> <outDir> <port>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

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
    const out = process.env.NORMALIZE === '1' ? normalizeTimestamps(record) : record;
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`captured ${endpoints.length} endpoints -> ${outDir}`);
} finally {
  child.kill('SIGKILL');
}
