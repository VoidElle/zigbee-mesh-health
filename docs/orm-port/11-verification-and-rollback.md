# 11 — Verification & rollback

Depends on: all

## Goal

Prove the port is behavior-preserving and define how to back out.

## Fixtures

Before deleting `src/storage/*`, capture golden outputs from the current build
against a copy of `data/mesh-health.db`:

- `/api/devices`, `/api/devices/:name/history?range=24h|7d|30d`,
  `/api/mesh/history?range=...`, `/api/events?...`, `/api/network/latest`,
  `/api/health`.
- Row counts and `.schema` of `data/mesh-health.db`.
- A retention run: `linkquality_daily_summary` rows before/after.

Store JSON snapshots under `scripts/fixtures/` (commit if small).

## Checks

1. `npm run build` clean, plus `npx tsc --noEmit`.
2. Run `scripts/test-events.mjs` and `scripts/test-status.mjs` unchanged; they
   must pass (extend them if they touch the DB directly).
3. Replay the API endpoints against a DB copy and diff JSON against fixtures.
   Only timestamps may vary; everything else must match.
4. Retention idempotency: run twice, second run is a no-op.
5. Restart test for 08: a transition after restart emits exactly one event.
6. Fresh-volume test: empty `DATA_DIR` -> schema created, service healthy.
7. Docker/add-on build (10).

## Manual smoke

- Point at a broker, publish a device payload with `linkquality`, confirm the
  sample lands and `/api/devices` updates.
- Trigger `/api/network/refresh` once; confirm the snapshot is stored and the
  rate limit is still enforced after a failure.

## Rollback

- Schema is unchanged except the additive `runtime_state` table (08). The old
  build ignores the extra table, so `git revert` restores `better-sqlite3`
  against a database it still opens and reads. Verified by running the old
  build against a post-port DB that contains `runtime_state`.
- Timestamp storage is text on both sides, but **not byte-identical**: the old
  build wrote `…Z` (`Date.toISOString()`); the adapter writes `…+00:00`
  (`@prisma/adapter-better-sqlite3` does `toISOString().replace("Z", "+00:00")`).
  SQLite `strftime`/`Date.parse` accept both, so the rollback is non-lossy, but:
  - rows written post-port read back as `+00:00` via the old raw-text queries
    (the ported repos normalise to `.toISOString()` on read, so the new API is
    stable at `…Z`);
  - lexicographic `ts >= ?` comparisons can order `+00:00` before `Z` for the
    same millisecond.
  If byte-identical output matters, normalise `+00:00` → `Z` before reverting
  (or keep the port).
- Do **not** enable `unixepoch-ms` (D2); that would turn timestamps into
  integers and make rollback genuinely lossy.
- Keep a copy of `data/mesh-health.db` before the first post-port run.

## Done when

- All fixtures match, both test scripts pass, build/deploy succeed.

## ponytail

Fixture diffing is the whole safety net; do not create a new test framework.
