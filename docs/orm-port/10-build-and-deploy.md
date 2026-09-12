# 10 — Build & deploy

Depends on: 01, 02

## Goal

Keep Docker and the kept Home Assistant add-on arches building after Prisma is
added.

## Dockerfile

- `npm ci` now installs Prisma; add `RUN npx prisma generate` after `npm ci`
  (the generated client must exist before `tsc`).
- `npm prune --omit=dev` must not delete what the runtime client needs.
  `@prisma/client` and the adapter are runtime deps; the `prisma` CLI is
  build-only. If `prisma generate` runs in a build stage, the CLI can be pruned
  afterwards.
- Keep `better-sqlite3`; the adapter depends on it. Keep the build toolchain
  (`python3 make g++`) for arches without prebuilds.

## Home Assistant add-on

- `addon/Dockerfile`: same `prisma generate` step; ensure the generated client
  lands where `tsc` and `node` resolve it.
- `addon/run.sh`: options unchanged. Do not run `prisma migrate` at runtime
  (D3).
- `.github/workflows/build.yml`: after 00 confirms engine support, either keep
  all four arches or remove `armv7`/`i386`. This is the only allowed arch
  change; document it in README if it happens.

## Acceptance

- `docker build .` succeeds.
- `docker compose up` serves `/api/health` on a fresh volume.
- Add-on images build for every arch kept in the matrix.

## ponytail

Do not add a separate build stage if the existing single stage still works;
split only if `npm prune` proves problematic.
