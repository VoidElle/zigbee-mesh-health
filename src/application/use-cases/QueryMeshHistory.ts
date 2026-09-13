import type { SampleRepository } from '../../domain/ports';
import type { MeshBucket } from '../../domain/entities';

export function createQueryMeshHistory({ samples }: { samples: SampleRepository }) {
  return {
    meshHistory(sinceMs: number): Promise<MeshBucket[]> {
      return samples.meshHistory(sinceMs);
    },
  };
}
