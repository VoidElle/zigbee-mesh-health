import { getPrisma } from './prismaClient';
import type { MaintenanceRepository } from '../../../domain/ports';

export function createPrismaMaintenanceRepository(): MaintenanceRepository {
  return {
    // ponytail: raw SQL here is intentional. INSERT ... SELECT ... GROUP BY ... ON
    // CONFLICT is a set-based op an ORM handles badly (upsert-in-a-loop is O(n)
    // round trips); the upgrade path is what this already is. Keep the weighted
    // average formula byte-for-byte - rewriting it per-row breaks it.
    async applyRetention(cutoff: string): Promise<void> {
      const prisma = getPrisma();
      await prisma.$transaction([
        prisma.$executeRaw`
      INSERT INTO linkquality_daily_summary (device_name, day, min_lqi, max_lqi, avg_lqi, sample_count)
      SELECT device_name,
             strftime('%Y-%m-%d', ts) AS day,
             MIN(lqi), MAX(lqi), AVG(lqi), COUNT(*)
      FROM linkquality_samples
      WHERE ts < ${cutoff}
      GROUP BY device_name, day
      ON CONFLICT(device_name, day) DO UPDATE SET
        min_lqi = MIN(excluded.min_lqi, linkquality_daily_summary.min_lqi),
        max_lqi = MAX(excluded.max_lqi, linkquality_daily_summary.max_lqi),
        avg_lqi = (avg_lqi * sample_count + excluded.avg_lqi * excluded.sample_count) / (sample_count + excluded.sample_count),
        sample_count = sample_count + excluded.sample_count`,
        prisma.$executeRaw`DELETE FROM linkquality_samples WHERE ts < ${cutoff}`,
      ]);
    },
  };
}
