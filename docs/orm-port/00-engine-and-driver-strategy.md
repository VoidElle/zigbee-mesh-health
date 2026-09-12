# 00 — Engine & driver strategy (spike)

Depends on: —
Blocks: 01

## Goal

Confirm the Prisma + SQLite approach against this project's real constraints
before any production code changes: the driver adapter works, timestamps
round-trip, and the four HA add-on architectures still build.

## Why this is a spike, not code

Prisma's native SQLite engine and `@prisma/adapter-better-sqlite3` differ in
two ways that decide the whole plan:

- engine binary availability per CPU arch,
- `DateTime` storage format (`iso8601` TEXT vs native `unixepoch-ms`).

## Steps

1. Pick the Prisma major version (latest stable). Record it in the result.
2. In a throwaway branch, add `prisma`, `@prisma/client`,
   `@prisma/adapter-better-sqlite3`, and keep `better-sqlite3`.
3. Minimal script: open the existing `data/mesh-health.db` read-only through
   the adapter with the default `iso8601`, `findMany` on `linkquality_samples`,
   assert `ts instanceof Date` and equals the stored ISO string.
4. Run `strftime('%s', ts)` through `$queryRaw` on a `DATETIME` column, assert
   it returns seconds (proves ISO-TEXT storage is intact).
5. Check `node_modules` for per-arch engine binaries and confirm whether the
   chosen version needs them with driver adapters. If it does, verify `armv7`
   and `i386` engine support; if unsupported, either enable the WASM query
   compiler or drop those arches from `.github/workflows/build.yml`.
6. Confirm `defaultSafeIntegers(true)` behavior: raw `COUNT(*)`/`AVG` results
   may arrive as `BigInt`. Note the coercion needed.

## Acceptance

- A written verdict appended under "## Spike result" covering: Prisma version,
  datetime format confirmed, arch support confirmed, BigInt behavior.
- If D1 (adapter) is rejected, stop and re-plan with `@prisma/adapter-libsql`
  or the native engine.

## ponytail

This spike exists to avoid porting the app twice. Do it in a branch; delete it
when the verdict is recorded.

## Spike result

Spike run 2026-09-12 on darwin-arm64, Node v24.14.0, npm 11.9.0. Throwaway
branch `spike/prisma-adapter` (deleted after). Production tree restored
unchanged.

### Verdict: D1 ACCEPTED

Prisma + `@prisma/adapter-better-sqlite3` works against the existing schema and
timestamp format. No blocker. Proceed with step 01.

### Prisma version

- `prisma` **7.10.0**, `@prisma/client` **7.10.0**,
  `@prisma/adapter-better-sqlite3` **7.10.0** (all exact-pinned).
- npm `latest` currently points at `8.0.0-rc.14` (prerelease). The latest
  **stable** line is 7.10.0 (`dist-tags.prev`; the adapter's own `latest` is
  also 7.10.0). Pin 7.10.0 until 8.x is stable and the adapter ships a matching
  version.
- `better-sqlite3` kept (adapter already depends on `^12.6.0`; installed 12.x
  satisfies it).

### Adapter API shape used

```js
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const adapter = new PrismaBetterSqlite3({
  url: '/abs/path/mesh-health.db', // adapter strips a leading `file:`
  readonly: true,                  // better-sqlite3 Options are spread through
  fileMustExist: true,
});
const prisma = new PrismaClient({ adapter });
```

Class is `PrismaBetterSqlite3`. Constructor is
`(config: better-sqlite3 Options & { url }, options?: { timestampFormat, shadowDatabaseUrl })`.
`readonly` / `fileMustExist` pass straight to `better-sqlite3`. A write attempt
on the read-only connection was rejected, confirming read-only is enforced.

Client generation: the classic `prisma-client-js` generator still exists in
7.10 and emits to `node_modules/@prisma/client` (works with the repo's `tsc`
CommonJS build). Prisma 7 also offers the newer `prisma-client` generator, which
emits TypeScript to a custom `output` and needs a TS/bundler runtime — noted for
step 01; not required by this spike.

### Datetime format confirmed: `iso8601` (default)

- Adapter default is `timestampFormat ?? "iso8601"` (adapter `dist/index.js:412`).
- `findMany` on `linkquality_samples`: `ts instanceof Date === true`, and
  `ts.toISOString()` equals the stored ISO string exactly
  (`2026-09-10T12:34:56.789Z`), including milliseconds.
- `strftime('%s', ts)` through `$queryRawUnsafe` returned the correct epoch
  seconds for the stored ISO value (`1789043696`). ISO-TEXT storage is intact,
  so existing raw aggregate/retention SQL keeps working and no data migration
  is needed.

Exact output:

```
findMany count: 3
  id=1 sensor-a lqi=180 ts=2026-09-10T12:34:56.789Z isDate=true typeofId=number
  ...
PASS findMany: ts instanceof Date and equals stored ISO 2026-09-10T12:34:56.789Z
strftime raw: { s: '1789043696', t: 'text', si: 1789043696n } typeof= string sqlite typeof= text typeof si= bigint
PASS strftime: 1789043696 => seconds (expected 1789043696)
raw COUNT(*) = 3n typeof= bigint
raw AVG(lqi) = 145 typeof= number
typed lqi typeof = number typed id typeof = number
PASS BigInt: raw COUNT(*) is BigInt, typed Int columns are Number
PASS read-only: write rejected
ALL ASSERTIONS PASSED
```

Test data: the committed `data/mesh-health.db` existed but had **0 rows**. A
copy was seeded (not the original) with 3 rows in the existing schema so the
round-trip and `strftime` assertions were meaningful. The original DB was never
opened for write and is unchanged.

### Arch support confirmed (all four HA arches OK)

With a driver adapter, **no per-arch native Prisma engine is needed at runtime**:

- The query compiler is WASM, shipped as base64 in
  `@prisma/client/runtime/query_compiler_fast_bg.sqlite.wasm-base64.js`. No
  `.node` or `.wasm` file is loaded from disk and no Rust query engine is
  downloaded.
- `@prisma/client` runtime deps are only `@prisma/client-runtime-utils`; it does
  **not** depend on `@prisma/engines`.
- `@prisma/engines` ships `schema-engine-<platform>` (24 MB native binary) used
  only by the CLI's migrate/introspect/db-push. The plan keeps idempotent DDL and
  does **not** use Prisma Migrate (D3), so this engine is never invoked.
- Proof: with `node_modules/@prisma/engines/schema-engine-darwin-arm64` moved
  away, both `prisma generate` and the full runtime spike still passed.
- The engine download in `@prisma/engines` postinstall uses `failSilent: true`,
  so a missing engine for an unsupported target cannot break `npm ci`. The
  `prisma` CLI is a devDependency and is removed by the existing
  `npm prune --omit=dev` before the runtime image layer.

Per arch:

- **aarch64 / amd64**: native engine targets exist and are irrelevant anyway.
- **armv7** (`linux/arm/v7`): query compiler WASM is arch-independent; Prisma
  publishes `linux-arm-openssl-*` schema-engine targets if ever needed.
- **i386** (`linux/386`): no 32-bit x86 target exists in
  `@prisma/get-platform` `binaryTargets` (no `ia32`/`i386`/`debian-*-386`), so
  the CLI schema engine would be unavailable on i386 — but it is neither
  downloaded fatally (`failSilent`) nor used at runtime (WASM + adapter), and
  the CLI is pruned from the image. Therefore i386 stays supported.
- Runtime native dependency remains `better-sqlite3`, which the Dockerfiles
  already compile from source on armv7/i386 (`python3 make g++` present).

### BigInt behavior (`defaultSafeIntegers(true)`)

The adapter **always** calls `db.defaultSafeIntegers(true)` on connect
(adapter `dist/index.js:681`); it is not opt-in and cannot be disabled via the
constructor. Consequences:

- Raw `$queryRaw` integer results arrive as **BigInt**: `COUNT(*)` → `3n`.
- Raw `AVG(...)` over INTEGER returns REAL → arrives as **Number** (`145`); a
  non-fractional integer expression can still arrive as BigInt.
- Integer model fields via typed `findMany` are coerced by the client to
  **Number** (`lqi`, `id` both `number`). So model reads are unaffected.
- `strftime('%s', ts)` returns SQLite TEXT; `CAST(... AS INTEGER)` returns
  BigInt.

Coercion needed at raw-query boundaries: wrap raw integer aggregates in
`Number(...)` (e.g. `Number(row.count)`) before using them as counts/ids, and
`Number()` any `CAST(... AS INTEGER)` date math. This matters for the ported
`src/analysis/status.ts` and retention/bucketing queries — call out in step 04/07.

### Commands run

```
npm install prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-better-sqlite3@7.10.0
npx prisma generate --schema spike-schema-js.prisma   # provider = "prisma-client-js"
node spike-run.cjs
```

No production files or dependency manifests were changed; the spike branch and
throwaway schema/script/generated client were removed after recording this.
