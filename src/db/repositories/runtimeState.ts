import { getPrisma } from '../client';

// Dumb KV store (D6). `null` (no row) maps to `undefined` so callers keep the
// exact in-memory `string | undefined` semantics they had before persistence.
export async function getValue(key: string): Promise<string | undefined> {
  const row = await getPrisma().runtimeState.findUnique({ where: { key } });
  return row?.value;
}

export async function setValue(key: string, value: string): Promise<void> {
  await getPrisma().runtimeState.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

// In-process per-key lock: serialises read-modify-write so two overlapping
// async messages for the same key cannot both read the old value and then miss
// or duplicate a transition (the old synchronous Map was atomic by construction).
// DB access stays single-writer; this only orders the callers within one process.
const locks = new Map<string, Promise<unknown>>();

export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn); // proceed even if the previous holder rejected
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}
