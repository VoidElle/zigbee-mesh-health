// Run after `npm run build`: node scripts/test-samples.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'mh-samples-test-'));

const { getDb, closePrisma } = await import('../dist/db/client.js');
const { history, listDeviceNames, latestLqiPerDevice, meshHistory, enqueueSample, flushSamples } =
  await import('../dist/db/repositories/samples.js');

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
};
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

const db = getDb();
const ins = db.prepare(
  'INSERT INTO linkquality_samples (device_name, ieee_address, lqi, ts) VALUES (?, ?, ?, ?)'
);
ins.run('a-dev', '0xa', 100, iso(2 * HOUR));
ins.run('a-dev', '0xa', 150, iso(1 * HOUR));
ins.run('b-dev', '0xb', 200, iso(0.5 * HOUR));

// listDeviceNames: distinct + ascending
const names = await listDeviceNames();
assert(JSON.stringify(names) === JSON.stringify(['a-dev', 'b-dev']), `listDeviceNames ordered: ${names}`);

// history: ascending by ts, ISO strings, exact values
const h = await history('a-dev', DAY);
assert(h.length === 2, 'history length');
assert(h[0].lqi === 100 && h[1].lqi === 150, 'history ascending order/values');
assert(h.every((r) => typeof r.ts === 'string' && new Date(r.ts).toISOString() === r.ts), 'history ts is ISO string');
assert(!h.some((r) => r.ts instanceof Date), 'history ts is not a Date');
assert((await history('a-dev', HOUR / 2)).length === 0, 'history since filter');

// latestLqiPerDevice: latest id per device, numeric lqi, ISO ts
const latest = await latestLqiPerDevice();
assert(latest.length === 2, 'latest length');
assert(latest[0].name === 'a-dev' && latest[0].lqi === 150 && latest[0].ieee === '0xa', 'latest a-dev');
assert(latest[1].name === 'b-dev' && latest[1].lqi === 200, 'latest b-dev');
assert(latest.every((r) => typeof r.lqi === 'number' && typeof r.ts === 'string'), 'latest types coerced');

// meshHistory: bucket counts coerced to Number, values sane
const mh = await meshHistory(DAY);
assert(mh.reduce((a, p) => a + p.n, 0) === 3, 'meshHistory total count');
assert(mh.every((p) => typeof p.n === 'number' && p.lqi >= 0 && p.lqi <= 255 && !Number.isNaN(Date.parse(p.ts))), 'meshHistory shapes');

// flushSamples: buffered insert lands via Prisma createMany (also auto-flush at size)
enqueueSample('c-dev', '0xc', 77);
enqueueSample('c-dev', '0xc', 88);
await flushSamples();
const ch = await history('c-dev', DAY);
assert(ch.length === 2 && [77, 88].every((v) => ch.some((r) => r.lqi === v)), 'flushSamples createMany');

await closePrisma();
console.log('samples.test OK');
