import { getPrisma } from './prismaClient';
import type { SampleRepository } from '../../../domain/ports';
import type {
  LatestLinkQuality,
  LinkQualityPoint,
  LinkQualitySample,
  MeshBucket,
} from '../../../domain/entities';

export function createPrismaSampleRepository(): SampleRepository {
  return {
    // ponytail: createMany is one statement; if step 11 verifies SQLite applies it
    // atomically, drop the explicit $transaction wrapper.
    async saveBatch(samples: LinkQualitySample[]): Promise<void> {
      const prisma = getPrisma();
      await prisma.$transaction([
        prisma.linkQualitySample.createMany({
          data: samples.map((r) => ({
            deviceName: r.device,
            ieeeAddress: r.ieee,
            lqi: r.lqi,
            ts: new Date(r.ts),
          })),
        }),
      ]);
    },

    // ponytail: "latest row per device" needs a correlated MAX(id) subquery join;
    // the typed query builder cannot express it in one round trip, so keep raw SQL.
    // Raw integer columns arrive as BigInt (defaultSafeIntegers), hence Number().
    async latestLqiPerDevice(): Promise<LatestLinkQuality[]> {
      const rows = await getPrisma().$queryRaw<
        { name: string; ieee: string | null; lqi: number | bigint; ts: Date | string }[]
      >`
        SELECT s.device_name AS name, s.ieee_address AS ieee, s.lqi AS lqi, s.ts AS ts
        FROM linkquality_samples s
        JOIN (
          SELECT device_name, MAX(id) AS max_id FROM linkquality_samples GROUP BY device_name
        ) m ON m.max_id = s.id
        ORDER BY s.device_name`;
      return rows.map((r) => ({
        name: r.name,
        ieee: r.ieee,
        lqi: Number(r.lqi),
        ts: r.ts instanceof Date ? r.ts.toISOString() : r.ts,
      }));
    },

    // ponytail: raw samples table only; if a range spans beyond retention, old data
    // lives in linkquality_daily_summary - union it in when daily granularity suffices.
    async history(device: string, sinceMs: number): Promise<LinkQualityPoint[]> {
      const rows = await getPrisma().linkQualitySample.findMany({
        where: { deviceName: device, ts: { gte: new Date(Date.now() - sinceMs) } },
        orderBy: { ts: 'asc' },
        select: { lqi: true, ts: true },
      });
      return rows.map((r) => ({ lqi: r.lqi, ts: r.ts.toISOString() }));
    },

    // Mesh-wide average LQI over time, ~96 buckets across the range.
    // ponytail: message-weighted average - chatty devices dominate a bucket;
    // pre-average per device first if that ever skews the trend visibly.
    // ponytail: strftime/GROUP BY bucketing is awkward in the query builder; raw
    // SQL kept. COUNT/CAST return BigInt (defaultSafeIntegers) → coerce with Number().
    async meshHistory(sinceMs: number): Promise<MeshBucket[]> {
      const since = new Date(Date.now() - sinceMs).toISOString();
      const width = Math.max(1, Math.round(sinceMs / 96 / 1000)); // bucket size in seconds
      const rows = await getPrisma().$queryRaw<
        { b: number | bigint; avg: number; n: number | bigint }[]
      >`
        SELECT (CAST(strftime('%s', ts) AS INTEGER) / ${width}) * ${width} AS b, AVG(lqi) AS avg, COUNT(*) AS n
        FROM linkquality_samples WHERE ts >= ${since} GROUP BY b ORDER BY b`;
      return rows.map((r) => ({
        ts: new Date(Number(r.b) * 1000).toISOString(),
        lqi: Math.round(r.avg),
        n: Number(r.n),
      }));
    },

    async listDeviceNames(): Promise<string[]> {
      const rows = await getPrisma().linkQualitySample.findMany({
        distinct: ['deviceName'],
        select: { deviceName: true },
        orderBy: { deviceName: 'asc' },
      });
      return rows.map((r) => r.deviceName);
    },

    async avgLqiPerDevice(sinceMs: number): Promise<Map<string, number>> {
      const rows = await getPrisma().linkQualitySample.groupBy({
        by: ['deviceName'],
        where: { ts: { gte: new Date(Date.now() - sinceMs) } },
        _avg: { lqi: true },
      });
      // AVG over typed Int is a JS number; a group only exists if it has rows, so non-null.
      return new Map(rows.map((r) => [r.deviceName, r._avg.lqi as number]));
    },
  };
}
