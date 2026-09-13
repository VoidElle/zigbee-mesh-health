# Task 12 — Architecture guard and docs

**Depends on:** task 11.
**Touches:** adds `test/architecture.test.mjs`; updates `README.md`.

## Goal

Lock the dependency rule in with a runnable test and document the new structure.

## File to create: `test/architecture.test.mjs`

Pure file-scanning test (no build dependency beyond the existing suite). For each
`src/**/*.ts` file, extract import specifiers and assert the rules.

Rules:

- `src/domain/**` must not import from `application/`, `infrastructure/`,
  `composition/`, any npm package, any `node:*` builtin, or
  `generated/prisma`.
- `src/application/**` must not import from `infrastructure/`, `composition/`,
  any npm package, any `node:*` builtin, or `generated/prisma`.
- `src/infrastructure/**` must not import from `composition/`.
- No file imports a path containing `db/repositories`, `src/mqtt`, `src/api`,
  `src/analysis`, `src/networkmap` (legacy paths gone).

Suggested implementation shape:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url);
// walk .ts files, strip comments, collect `from '...'` specifiers
// assert per-layer allowlists; fail with file + specifier in the message
```

Keep it dependency-free and deterministic. This is the single runnable guard for
the architecture; no ESLint plugin needed.

## File to modify: `README.md`

Add a short "Architecture" section (do not rewrite unrelated content):

- the four layers and the dependency direction;
- a compact tree of `src/`;
- where new code goes (business rule → `domain`; orchestration → `application`;
  IO/adapter → `infrastructure`; wiring → `composition`);
- note that `composition/container.ts` is the public seam and tests import from
  it.

Update any stale paths elsewhere in the README (`src/db/...`, `src/mqtt/...`)
to the new locations.

## Verify

- `npm run build` exits 0.
- `npm test` exits 0, including `test/architecture.test.mjs`.
- Deliberately introduce a violation locally (e.g. an `application` file
  importing `better-sqlite3`) and confirm the test fails; then revert. Document
  the observed failure in the task output.

## Done when

The dependency rule is enforced by a passing test, README reflects the layered
structure, and the full suite is green.
