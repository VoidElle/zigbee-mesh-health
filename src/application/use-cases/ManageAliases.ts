import type { AliasRepository } from '../../domain/ports';

export function createManageAliases({ aliases }: { aliases: AliasRepository }) {
  return {
    getAllAliases(): Promise<Map<string, string>> {
      return aliases.getAll();
    },
    setAlias(name: string, alias: string | null): Promise<void> {
      return aliases.set(name, alias);
    },
  };
}
