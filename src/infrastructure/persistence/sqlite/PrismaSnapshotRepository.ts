import { getPrisma } from './prismaClient';
import type { SnapshotRepository } from '../../../domain/ports';
import type { NetworkSnapshotRecord } from '../../../domain/entities';

export function createPrismaSnapshotRepository(): SnapshotRepository {
  return {
    async insert(rawJson: string): Promise<void> {
      await getPrisma().networkSnapshot.create({ data: { ts: new Date(), rawJson } });
    },

    async latest(): Promise<NetworkSnapshotRecord | null> {
      const row = await getPrisma().networkSnapshot.findFirst({
        orderBy: { id: 'desc' },
        select: { ts: true, rawJson: true },
      });
      return row ? { ts: row.ts.toISOString(), raw_json: row.rawJson } : null;
    },
  };
}
