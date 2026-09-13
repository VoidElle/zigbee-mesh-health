// Run after `npm run build`: node --test test/api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { freshDataDir, normalizeTimestamps } from './helpers.mjs';
import { endpoints } from './fixtures/endpoints.mjs';

freshDataDir('mh-api-test-');

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const goldenDir = new URL('./fixtures/golden/', import.meta.url);

// mesh-history buckets are epoch-aligned (wall-clock dependent), so only the
// fixed total sample counts per window are asserted; see plans/03.
const MESH_TOTALS = { 'mesh-history-24h': 10, 'mesh-history-7d': 17, 'mesh-history-30d': 24 };

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let child;
let base;
let serverLog = '';

before(async () => {
  const { getDb, closeDb } = await import('../dist/db/client.js');
  getDb().exec(readFileSync(new URL('./fixtures/seed.sql', import.meta.url), 'utf8'));
  closeDb();

  const port = await getFreePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn('node', ['dist/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: process.env.DATA_DIR,
      HTTP_PORT: String(port),
      MQTT_HOST: '127.0.0.1',
      MQTT_PORT: '18999',
      RETENTION_DAYS: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (d) => (serverLog += d);
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`server not ready on ${base}\n${serverLog}`);
});

after(() => {
  child?.kill('SIGKILL');
});

for (const [name, path] of endpoints) {
  test(name, async () => {
    const res = await fetch(base + path);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    const actual = normalizeTimestamps({ status: res.status, body });
    const expected = JSON.parse(
      readFileSync(new URL(`./fixtures/golden/${name}.json`, import.meta.url), 'utf8')
    );

    if (name.startsWith('mesh-history-')) {
      assert.equal(actual.status, expected.status, `${name} status`);
      assert.equal(actual.body.range, expected.body.range, `${name} range`);
      const total = actual.body.points.reduce((sum, p) => sum + p.n, 0);
      assert.equal(total, MESH_TOTALS[name], `${name} total samples`);
      for (const p of actual.body.points) {
        assert.ok(Number.isInteger(p.n) && p.n >= 1, `${name} point n >= 1`);
        assert.ok(Number.isInteger(p.lqi) && p.lqi >= 0 && p.lqi <= 255, `${name} point lqi in [0,255]`);
        assert.equal(p.ts, 'TS', `${name} point ts normalised`);
      }
      const rawTs = body.points.map((p) => p.ts);
      for (let i = 1; i < rawTs.length; i++) {
        assert.ok(rawTs[i] > rawTs[i - 1], `${name} point ts strictly ascending`);
      }
      return;
    }

    assert.deepEqual(actual, expected);
  });
}

test('golden files and endpoint entries match 1:1', () => {
  const goldenNames = readdirSync(goldenDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  const endpointNames = endpoints.map(([n]) => n).sort();
  assert.deepEqual(goldenNames, endpointNames);
});

test('PUT alias persists, surfaces on /api/devices, and validates input', async () => {
  const put = (name, body) =>
    fetch(`${base}/api/devices/${encodeURIComponent(name)}/alias`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const ok = await put('Luce', { alias: '  Lampada  ' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { name: 'Luce', alias: 'Lampada' });
  const devices = await (await fetch(`${base}/api/devices`)).json();
  assert.equal(devices.devices.find((d) => d.name === 'Luce').alias, 'Lampada');

  assert.equal((await put('Nope', { alias: 'x' })).status, 404);
  assert.equal((await put('Luce', { alias: 'x'.repeat(61) })).status, 400);
  assert.equal((await put('Luce', { alias: 42 })).status, 400);

  const clear = await put('Luce', { alias: '' });
  assert.equal(clear.status, 200);
  assert.deepEqual(await clear.json(), { name: 'Luce', alias: null });
});
