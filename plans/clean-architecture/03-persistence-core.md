# Task 03 — Infrastructure: persistence core

**Depends on:** task 02.
**Touches:** `src/infrastructure/persistence/sqlite/prismaClient.ts`,
`src/infrastructure/persistence/sqlite/schema.ts`; shims `src/db/client.ts`,
`src/db/bootstrap.ts`.

## Goal

Move the SQLite/Prisma bootstrap and schema DDL into the persistence adapter.

## Files to create

### `src/infrastructure/persistence/sqlite/prismaClient.ts`

Move `src/db/client.ts` verbatim. Fix relative imports:

- `import { dbFile } from '../config'` → `import { dbFile } from '../../config'`
- `import { PrismaClient } from '../generated/prisma/client'` →
  `import { PrismaClient } from '../../../generated/prisma/client'`
- `import { bootstrapSchema } from './bootstrap'` → `import { bootstrapSchema } from './schema'`

Exports unchanged: `getDb`, `closeDb`, `getPrisma`, `closePrisma`. Preserve all
comments and the WAL/`$executeRawUnsafe` behavior exactly.

### `src/infrastructure/persistence/sqlite/schema.ts`

Move `src/db/bootstrap.ts` verbatim (DDL must not change by one character).
Update only the comment reference `../../prisma/schema.prisma` →
`../../../../prisma/schema.prisma`. Export `bootstrapSchema` unchanged.

## Files to modify (shims)

```ts
// src/db/client.ts
export * from '../infrastructure/persistence/sqlite/prismaClient';
```

```ts
// src/db/bootstrap.ts
export * from '../infrastructure/persistence/sqlite/schema';
```

## Import updates

None. Old paths keep resolving. Tests importing `../dist/db/client.js` keep
working.

## Verify

- `npm run build` exits 0. The generated Prisma import path is the main risk.
- `npm test` green (persistence untouched).

## Done when

Persistence core lives under `infrastructure/persistence/sqlite/`, shims resolve,
build + tests green.
