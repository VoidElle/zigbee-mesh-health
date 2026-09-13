import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function freshDataDir(prefix = 'mh-test-') {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), prefix));
  return process.env.DATA_DIR;
}

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})/g;

export function normalizeTimestamps(value) {
  return JSON.parse(JSON.stringify(value).replace(ISO, 'TS'));
}
