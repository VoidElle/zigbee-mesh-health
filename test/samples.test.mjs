// Run after `npm run build`: node --test test/samples.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { freshDataDir } from './helpers.mjs';

freshDataDir('mh-samples-test-');

const { getDb, closePrisma } = await import('../dist/db/client.js');
const { history, listDeviceNames, latestLqiPerDevice, meshHistory, enqueueSample, flushSamples } =
  await import('../dist/db/repositories/samples.js');

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

after(async () => {
  await closePrisma();
});

test('samples repository', async () => {
  const db = getDb();
  const ins = db.prepare(
    'INSERT INTO linkquality_samples (device_name, ieee_address, lqi, ts) VALUES (?, ?, ?, ?)'
  );
  ins.run('a-dev', '0xa', 100, iso(2 * HOUR));
  ins.run('a-dev', '0xa', 150, iso(1 * HOUR));
  ins.run('b-dev', '0xb', 200, iso(0.5 * HOUR));

  // listDeviceNames: distinct + ascending
  const names = await listDeviceNames();
  assert.ok(JSON.stringify(names) === JSON.stringify(['a-dev', 'b-dev']), `listDeviceNames ordered: ${names}`);

  // history: ascending by ts, ISO strings, exact values
  const h = await history('a-dev', DAY);
  assert.ok(h.length === 2, 'history length');
  assert.ok(h[0].lqi === 100 && h[1].lqi === 150, 'history ascending order/values');
  assert.ok(
    h.every((r) => typeof r.ts === 'string' && new Date(r.ts).toISOString() === r.ts),
    'history ts is ISO string'
  );
  assert.ok(!h.some((r) => r.ts instanceof Date), 'history ts is not a Date');
  assert.ok((await history('a-dev', HOUR / 2)).length === 0, 'history since filter');

  // latestLqiPerDevice: latest id per device, numeric lqi, ISO ts
  const latest = await latestLqiPerDevice();
  assert.ok(latest.length === 2, 'latest length');
  assert.ok(latest[0].name === 'a-dev' && latest[0].lqi === 150 && latest[0].ieee === '0xa', 'latest a-dev');
  assert.ok(latest[1].name === 'b-dev' && latest[1].lqi === 200, 'latest b-dev');
  assert.ok(latest.every((r) => typeof r.lqi === 'number' && typeof r.ts === 'string'), 'latest types coerced');

  // meshHistory: bucket counts coerced to Number, values sane
  const mh = await meshHistory(DAY);
  assert.ok(mh.reduce((a, p) => a + p.n, 0) === 3, 'meshHistory total count');
  assert.ok(
    mh.every((p) => typeof p.n === 'number' && p.lqi >= 0 && p.lqi <= 255 && !Number.isNaN(Date.parse(p.ts))),
    'meshHistory shapes'
  );

  // flushSamples: buffered insert lands via Prisma createMany (also auto-flush at size)
  enqueueSample('c-dev', '0xc', 77);
  enqueueSample('c-dev', '0xc', 88);
  await flushSamples();
  const ch = await history('c-dev', DAY);
  assert.ok(ch.length === 2 && [77, 88].every((v) => ch.some((r) => r.lqi === v)), 'flushSamples createMany');
});
