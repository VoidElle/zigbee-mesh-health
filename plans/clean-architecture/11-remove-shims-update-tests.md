# Task 11 — Remove shims and update tests

**Depends on:** task 10.
**Touches:** deletes all shim/legacy files; updates test imports; full suite.

## Goal

Delete every temporary re-export shim and point the test suite at the composition
seam, then restore a fully green suite with no legacy paths remaining.

## Files to delete

- `src/config.ts`
- `src/runtime.ts`
- `src/db/` (entire directory: `client.ts`, `bootstrap.ts`, `repositories/*`)
- `src/mqtt/` (entire directory)
- `src/networkmap/` (entire directory)
- `src/api/` (entire directory)
- `src/analysis/` (entire directory)
- `src/index.ts` — keep only if it still starts the app; otherwise keep as
  `import './composition/main';` (it is the package entry, not a shim). Keep it.
- `src/infrastructure/**/public-api.ts` files created for networkmap/http shims.

Before deleting, grep for every import of each old path under `src/` and repoint
it at the new module. The build must have zero dangling imports afterwards.

## Test import updates

Only import paths change; assertions and test logic stay identical. Replace with
`../dist/composition/container.js`:

- `test/api.test.mjs:39`
  `const { getDb, closeDb } = await import('../dist/composition/container.js');`
- `test/events.test.mjs:10-13` →
  `const { classifyLogging, extractDeviceName, handleLogging, handleBridgeEvent, handleInfo, handleDevices, handleDeviceMessage, listEvents, insertEvent, eventBus, latestLqiPerDevice, flushSamples } = await import('../dist/composition/container.js');`
- `test/samples.test.mjs:9-11` →
  `const { getDb, closePrisma, history, listDeviceNames, latestLqiPerDevice, meshHistory, enqueueSample, flushSamples, sampleBus } = await import('../dist/composition/container.js');`
- `test/status.test.mjs:9-11` →
  `const { getDb, closePrisma, computeDeviceSummaries, meshHistory } = await import('../dist/composition/container.js');`

`test/fixtures/*` and `test/i18n.test.mjs` / `test/map-arrows.test.mjs` are
untouched (they read files, not modules).

## Checklist

1. Delete the legacy files/dirs listed above.
2. Repoint all remaining `src/` imports; `npm run build` must be clean.
3. Update the four test imports.
4. Confirm no `public-api.ts` shim remains.
5. `grep -rn "db/repositories\|mqtt/\|networkmap/\|api/server\|analysis/status" src test` returns no stale paths.
6. `npm test` — all tests green against golden fixtures.

## Verify

- `npm run build` exits 0.
- `npm test` exits 0 with every test passing and no golden file modified
  (`git diff --stat test/fixtures` empty).
- `git status` shows only intended deletions/edits.

## Done when

Zero shims, all imports resolve to `domain` / `application` / `infrastructure` /
`composition`, full suite green.
