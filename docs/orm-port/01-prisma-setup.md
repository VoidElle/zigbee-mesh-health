# 01 — Prisma setup

Depends on: 00
Blocks: 02, 09, 10

## Goal

Add Prisma to the project without breaking the current build.

## Changes

- `package.json`
  - deps: `@prisma/client`, `@prisma/adapter-better-sqlite3`
  - devDeps: `prisma` (CLI); keep `better-sqlite3` + `@types/better-sqlite3`
  - scripts: `"prisma:generate": "prisma generate"`
- New `prisma/schema.prisma` (models in 02).
- Document `DATABASE_URL` derivation (below). Do not commit a real `.env`.
- `tsconfig.json`: keep `rootDir: src`, `outDir: dist`. Prisma's generated
  client goes under `src/generated/prisma` so it compiles with the app, or use
  a `prisma-client-js` output path TypeScript resolves. Decide once in 00.

## DATABASE_URL

Built from `config.dataDir` at runtime, not read from a static `.env` in
production. The adapter receives
`{ url: 'file:' + path.join(ensureDataDir(), 'mesh-health.db') }`.

## Steps

1. Install deps, run `prisma generate`, confirm the generated client compiles.
2. Decide generated-client handling: run `prisma generate` explicitly in the
   Docker build (10) and add the output dir to `.gitignore`. Do not rely on
   `postinstall` side effects.
3. Confirm `npm run build` still succeeds with the generated client present.

## Acceptance

- `npm ci && npx prisma generate && npm run build` passes.
- No runtime import of the `prisma` CLI.

## ponytail

Do not add `dotenv`; `src/config.ts` already reads `process.env`. Do not add
relation models. Do not add a `PrismaService` class.
