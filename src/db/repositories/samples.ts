import { EventEmitter } from 'node:events';
import { getPrisma } from '../client';
import { config } from '../../config';

// In-process kick channel for the SSE stream: fires once per sample flush.
// No payload - the frontend re-fetches its current view on each kick.
export const sampleBus = new EventEmitter();
sampleBus.setMaxListeners(0);

interface BufferedSample {
  device: string;
  ieee: string | null;
  lqi: number;
  ts: number;
}

let buffer: BufferedSample[] = [];
let timer: NodeJS.Timeout | null = null;

export function enqueueSample(device: string, ieee: string | null, lqi: number): void {
  buffer.push({ device, ieee, lqi, ts: Date.now() });
  if (buffer.length >= config.flushBatchSize) void flushSamples();
}

// ponytail: createMany is one statement; if step 11 verifies SQLite applies it
// atomically, drop the explicit $transaction wrapper.
export async function flushSamples(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.linkQualitySample.createMany({
      data: batch.map((r) => ({
        deviceName: r.device,
        ieeeAddress: r.ieee,
        lqi: r.lqi,
        ts: new Date(r.ts),
      })),
    }),
  ]);
  sampleBus.emit('sample');
}

export function startBatchWriter(): void {
  if (timer) return;
  timer = setInterval(() => void flushSamples(), config.flushIntervalMs);
  timer.unref();
}

export async function stopBatchWriter(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await flushSamples();
}

// ponytail: "latest row per device" needs a correlated MAX(id) subquery join;
// the typed query builder cannot express it in one round trip, so keep raw SQL.
// Raw integer columns arrive as BigInt (defaultSafeIntegers), hence Number().
export async function latestLqiPerDevice(): Promise<
  { name: string; ieee: string | null; lqi: number; ts: string }[]
> {
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
}

// ponytail: raw samples table only; if a range spans beyond retention, old data
// lives in linkquality_daily_summary - union it in when daily granularity suffices.
export async function history(device: string, sinceMs: number): Promise<{ lqi: number; ts: string }[]> {
  const rows = await getPrisma().linkQualitySample.findMany({
    where: { deviceName: device, ts: { gte: new Date(Date.now() - sinceMs) } },
    orderBy: { ts: 'asc' },
    select: { lqi: true, ts: true },
  });
  return rows.map((r) => ({ lqi: r.lqi, ts: r.ts.toISOString() }));
}

// Mesh-wide average LQI over time, ~96 buckets across the range.
// ponytail: message-weighted average - chatty devices dominate a bucket;
// pre-average per device first if that ever skews the trend visibly.
// ponytail: strftime/GROUP BY bucketing is awkward in the query builder; raw
// SQL kept. COUNT/CAST return BigInt (defaultSafeIntegers) → coerce with Number().
export async function meshHistory(sinceMs: number): Promise<{ ts: string; lqi: number; n: number }[]> {
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
}

export async function listDeviceNames(): Promise<string[]> {
  const rows = await getPrisma().linkQualitySample.findMany({
    distinct: ['deviceName'],
    select: { deviceName: true },
    orderBy: { deviceName: 'asc' },
  });
  return rows.map((r) => r.deviceName);
}
