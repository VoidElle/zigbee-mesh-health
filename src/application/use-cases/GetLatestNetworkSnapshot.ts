import type { SnapshotRepository } from '../../domain/ports';
import type { NetworkSnapshotRecord } from '../../domain/entities';

export function createGetLatestNetworkSnapshot({ snapshots }: { snapshots: SnapshotRepository }) {
  return {
    latest(): Promise<NetworkSnapshotRecord | null> {
      return snapshots.latest();
    },
  };
}
