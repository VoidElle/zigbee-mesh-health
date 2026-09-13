import type { SampleRepository } from '../../domain/ports';
import type { LinkQualityPoint } from '../../domain/entities';

export function createQueryDeviceHistory({ samples }: { samples: SampleRepository }) {
  return {
    async history(device: string, sinceMs: number): Promise<LinkQualityPoint[]> {
      const points = await samples.history(device, sinceMs);
      return points.map((r) => ({ ts: r.ts, lqi: r.lqi }));
    },
  };
}
