import { getPrisma } from '../client';
import { setValue } from './runtimeState';

// User-facing device aliases live in the runtime_state KV under `alias:<canonical>`.
// The canonical Z2M name stays the key everywhere (samples, history, events); the
// alias is display-only.
const PREFIX = 'alias:';

export async function getAllAliases(): Promise<Map<string, string>> {
  const rows = await getPrisma().runtimeState.findMany({
    where: { key: { startsWith: PREFIX } },
  });
  return new Map(rows.map((r) => [r.key.slice(PREFIX.length), r.value]));
}

export async function setAlias(name: string, alias: string | null): Promise<void> {
  const key = PREFIX + name;
  if (!alias) {
    await getPrisma().runtimeState.deleteMany({ where: { key } });
    return;
  }
  await setValue(key, alias);
}
