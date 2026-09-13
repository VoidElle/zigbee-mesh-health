// Run after `npm run build`: node --test test/status.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { freshDataDir } from './helpers.mjs';

freshDataDir('mh-status-test-');

const { getDb, closePrisma } = await import('../dist/db/client.js');
const { computeDeviceSummaries } = await import('../dist/analysis/status.js');
const { meshHistory } = await import('../dist/db/repositories/samples.js');

after(async () => {
  await closePrisma();
});

test('device status summaries + mesh history', async () => {
  const db = getDb();
  const insSample = db.prepare(
    'INSERT INTO linkquality_samples (device_name, ieee_address, lqi, ts) VALUES (?, ?, ?, ?)'
  );
  const insEvent = db.prepare(
    'INSERT INTO log_events (ts, event_type, device_name, message) VALUES (?, ?, ?, ?)'
  );
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const HOUR = 3600_000;
  const DAY = 24 * HOUR;

  // ok-dev: stable 200
  for (let i = 0; i < 5; i++) insSample.run('ok-dev', '0x1', 200, iso(i * HOUR));
  // stale failure outside the 24h window must not count
  insEvent.run(iso(2 * DAY), 'delivery_failure', 'ok-dev', 'old');
  // warn-dev: 100 now vs 200 six days ago -> 24h avg 100 < 7d avg 150 * 0.8
  for (let i = 0; i < 5; i++) insSample.run('warn-dev', '0x2', 100, iso(i * HOUR));
  for (let i = 0; i < 5; i++) insSample.run('warn-dev', '0x2', 200, iso(6 * DAY + i * HOUR));
  // crit-low: 24h avg 40 < 50
  insSample.run('crit-low', '0x3', 40, iso(0));
  // crit-fail: healthy LQI but 6 route failures in 24h (> 5)
  insSample.run('crit-fail', '0x4', 200, iso(0));
  for (let i = 0; i < 6; i++) insEvent.run(iso(i * 600_000), 'route_failure', 'crit-fail', 'no route');

  const s = Object.fromEntries((await computeDeviceSummaries()).map((d) => [d.name, d]));

  assert.ok(s['ok-dev'].status === 'ok', 'ok-dev should be ok');
  assert.ok(s['ok-dev'].failures24h === 0, 'failure outside 24h must not count');
  assert.ok(s['warn-dev'].status === 'warning', 'warn-dev should be warning');
  assert.ok(s['warn-dev'].avg24h === 100 && s['warn-dev'].avg7d === 150, 'warn-dev averages');
  assert.ok(s['crit-low'].status === 'critical', 'crit-low should be critical');
  assert.ok(
    s['crit-fail'].status === 'critical' && s['crit-fail'].failures24h === 6,
    'crit-fail should be critical by failure count'
  );
  assert.ok(s['crit-low'].currentLqi === 40, 'currentLqi carried through');
  assert.ok(s['ok-dev'].ieee === '0x1', 'ieee carried through');
  assert.ok(s['ok-dev'].lastSeen && !Number.isNaN(Date.parse(s['ok-dev'].lastSeen)), 'lastSeen is a valid timestamp');

  // meshHistory: 24h window holds 12 samples (5×ok 200, 5×warn 100, crit-low 40, crit-fail 200)
  const mh = await meshHistory(DAY);
  const tot = mh.reduce((a, p) => a + p.n, 0);
  assert.ok(tot === 12 && mh.length === 5, 'meshHistory buckets and counts');
  assert.ok(mh.every((p) => p.lqi >= 0 && p.lqi <= 255 && !Number.isNaN(Date.parse(p.ts))), 'meshHistory values sane');
  assert.ok(mh.some((p) => p.lqi === 135) && mh.some((p) => p.lqi === 150), 'meshHistory averages');
});
