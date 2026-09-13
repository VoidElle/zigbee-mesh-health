import type { AliasRepository, SampleRepository } from '../../domain/ports';
import type { LatestLinkQuality } from '../../domain/entities';

export function createQueryDevices({
  samples,
  aliases,
}: {
  samples: SampleRepository;
  aliases: AliasRepository;
}) {
  return {
    async queryDevices(): Promise<(LatestLinkQuality & { alias: string | null })[]> {
      const [devices, aliasMap] = await Promise.all([samples.latestLqiPerDevice(), aliases.getAll()]);
      return devices.map((d) => ({ ...d, alias: aliasMap.get(d.name) ?? null }));
    },
  };
}
