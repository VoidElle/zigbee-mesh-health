// Run after `npm run build`: node --test test/map-arrows.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('buildMapSvg renders arrows and markers', () => {
  const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8')
    .replace(/\n(?:init\(\)|I18n\.ready\.then\(init\));\s*$/, '');

  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  const stubDoc = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, getElementById: () => null };
  const stubI18n = {
    t: (k) => en[k] ?? k,
    locale: 'en-GB',
    getLang: () => 'en',
    ready: Promise.resolve(),
    setLang: () => Promise.resolve(),
    onChange: () => () => {},
    apply() {},
  };
  const make = new Function('location', 'document', 'window', 'I18n', src + '\nreturn { buildMapSvg };');
  const { buildMapSvg } = make({ search: '', pathname: '/' }, stubDoc, { addEventListener() {} }, stubI18n);

  const value = {
    nodes: [
      { ieeeAddr: '0x00124b0018e1b6eb', nwkAddr: 0, type: 'Coordinator' },
      { ieeeAddr: '0x00124b0022b1c3dd', nwkAddr: 22136, type: 'Router' },
      { ieeeAddr: '0x00124b0022b1c3aa', nwkAddr: 40231, type: 'EndDevice' },
    ],
    links: [
      { sourceIeee: '0x00124b0018e1b6eb', targetIeee: '0x00124b0022b1c3dd', lqi: 132 },
      { sourceIeeeAddr: '0x00124b0022b1c3dd', targetIeeeAddr: '0x00124b0022b1c3aa', lqi: 31 },
    ],
  };

  const svg = buildMapSvg(value);
  const links = (svg.match(/<line\b/g) || []).length;
  const marked = (svg.match(/marker-end="url\(#arrow-/g) || []).length;
  const markers = (svg.match(/<marker\b/g) || []).length;

  assert.equal(markers, 3, `expected 3 markers, got ${markers}`);
  assert.equal(links, 2, `expected 2 lines, got ${links}`);
  assert.equal(marked, links, `expected all ${links} lines arrowed, got ${marked}`);
  assert.ok(svg.includes('arrow-crit'), 'weak link (lqi 31) should use arrow-crit');
  assert.ok(svg.includes('arrow-ok'), 'strong link (lqi 132) should use arrow-ok');
  assert.match(svg, /<text[^>]*>Coordinator<\/text>/, 'coordinator label comes from the i18n catalog');
  assert.equal(buildMapSvg({ nodes: [], links: [] }), '', 'empty map should render empty string');
});
