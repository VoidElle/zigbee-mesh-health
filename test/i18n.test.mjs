// Run: node --test test/i18n.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const it = JSON.parse(read('../public/i18n/it.json'));
const en = JSON.parse(read('../public/i18n/en.json'));
const html = read('../public/index.html');
const app = read('../public/app.js');
const i18n = read('../public/i18n.js');

const sorted = (arr) => [...arr].sort();
const diff = (a, b) => {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
};

function paramCounts(value) {
  const counts = {};
  for (const m of value.matchAll(/\{(\w+)}/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  return counts;
}

test('it.json and en.json key sets are identical', () => {
  const itKeys = Object.keys(it);
  const enKeys = Object.keys(en);
  const missing = diff(itKeys, enKeys);
  const extra = diff(enKeys, itKeys);
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `missing in en: [${missing}] ; extra in en: [${extra}]`
  );
});

test('every data-i18n* key in index.html exists in it.json', () => {
  const re = /data-i18n(?:-aria-label|-placeholder|-title|-html)?="([^"]+)"/g;
  const unknown = [];
  for (const m of html.matchAll(re)) if (!(m[1] in it)) unknown.push(m[1]);
  assert.deepEqual(unknown, [], `unknown HTML keys: [${unknown}]`);
});

test('every literal t(key) in app.js exists in it.json', () => {
  const re = /\bt\(\s*(['"])([a-z0-9.]+)\1/g;
  const unknown = [];
  for (const m of app.matchAll(re)) if (!(m[2] in it)) unknown.push(m[2]);
  assert.deepEqual([...new Set(unknown)], [], `unknown app.js keys: [${unknown}]`);
});

test('index.html loads i18n.js before app.js', () => {
  const i = html.indexOf('i18n.js');
  const a = html.indexOf('app.js');
  assert.ok(i !== -1, 'i18n.js script not referenced in index.html');
  assert.ok(a !== -1, 'app.js script not referenced in index.html');
  assert.ok(i < a, `i18n.js (${i}) must load before app.js (${a})`);
});

test('LANGS in i18n.js matches catalog basenames', () => {
  const m = i18n.match(/const\s+LANGS\s*=\s*\[([^\]]*)]/);
  assert.ok(m, 'const LANGS = [...] not found in i18n.js');
  const langs = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  const catalogs = readdirSync(new URL('../public/i18n/', import.meta.url))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  assert.deepEqual(sorted(langs), sorted(catalogs));
});

test('app.js contains no hardcoded it-IT locale', () => {
  assert.ok(!app.includes('it-IT'), 'hardcoded "it-IT" found; use I18n.locale');
});

test('addon it.yaml option keys match en.yaml', () => {
  const keys = (f) =>
    [...f.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  const a = keys(read('../addon/translations/en.yaml'));
  const b = keys(read('../addon/translations/it.yaml'));
  assert.deepEqual(b, a);
});

test('catalogs have no empty values and matching {param} tokens', () => {
  for (const [name, cat] of [['it', it], ['en', en]]) {
    for (const [key, value] of Object.entries(cat)) {
      assert.notEqual(value.trim(), '', `${name}.${key} is empty`);
    }
  }
  for (const key of Object.keys(it)) {
    assert.deepEqual(
      paramCounts(it[key]),
      paramCounts(en[key]),
      `param mismatch for ${key}: it=${JSON.stringify(it[key])} en=${JSON.stringify(en[key])}`
    );
  }
});
