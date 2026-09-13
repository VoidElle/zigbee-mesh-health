import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const LAYERS = new Set(['domain', 'application', 'infrastructure', 'composition']);
const LEGACY = ['db/repositories', 'src/mqtt', 'src/api', 'src/analysis', 'src/networkmap'];

const RULES = {
  domain: { allow: ['domain'], bare: false, deny: ['application/', 'infrastructure/', 'composition/', 'generated/prisma'] },
  application: { allow: ['domain', 'application'], bare: false, deny: ['infrastructure/', 'composition/', 'generated/prisma'] },
  infrastructure: { allow: null, bare: true, deny: ['composition/'] },
  composition: { allow: null, bare: true, deny: [] },
};

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'generated') continue; // Prisma output, exempt
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function specifiers(source) {
  const code = stripComments(source);
  const found = [];
  const patterns = [
    /\bimport\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gs,
    /\bexport\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gs,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) found.push(match[1]);
  }
  return found;
}

function layerOf(rel) {
  const segment = rel.split(sep)[0];
  return LAYERS.has(segment) ? segment : null;
}

function checkFile(file) {
  const rel = relative(ROOT, file);
  const layer = layerOf(rel);
  if (layer === null) return [];
  const rule = RULES[layer];
  const problems = [];
  const seen = new Set();
  const add = (spec, why) => {
    const message = `${rel} imports '${spec}': ${why}`;
    if (!seen.has(message)) {
      seen.add(message);
      problems.push(message);
    }
  };

  for (const spec of specifiers(readFileSync(file, 'utf8'))) {
    const bare = !spec.startsWith('.');
    let target = null;
    if (bare) {
      if (!rule.bare) add(spec, `${layer} may not import packages or node: builtins`);
    } else {
      target = relative(ROOT, resolve(dirname(file), spec)).split(sep).join('/');
      if (rule.allow) {
        const inside = rule.allow.some((a) => target === a || target.startsWith(a + '/'));
        if (!inside) add(spec, `resolves to '${target}', outside ${rule.allow.join('/')}`);
      }
    }
    for (const bad of rule.deny) {
      const prefix = bad.endsWith('/') ? bad.slice(0, -1) : bad;
      const hit = spec.includes(bad) || (target !== null && (target === prefix || target.startsWith(prefix + '/')));
      if (hit) add(spec, `forbidden dependency '${bad}'`);
    }
  }
  return problems;
}

function legacyProblems(files) {
  const problems = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      for (const legacy of LEGACY) {
        if (spec.includes(legacy)) problems.push(`${rel} imports '${spec}': legacy path '${legacy}'`);
      }
    }
  }
  return problems;
}

const FILES = walk(ROOT);

test('architecture: dependency rule points inward', () => {
  const problems = FILES.flatMap(checkFile);
  assert.equal(problems.length, 0, `\n${problems.join('\n')}`);
});

test('architecture: no imports of legacy paths', () => {
  const problems = legacyProblems(FILES);
  assert.equal(problems.length, 0, `\n${problems.join('\n')}`);
});
