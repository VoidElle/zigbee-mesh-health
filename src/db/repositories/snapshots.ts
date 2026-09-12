import { getPrisma } from '../client';

export async function insertSnapshot(rawJson: string): Promise<void> {
  await getPrisma().networkSnapshot.create({ data: { ts: new Date(), rawJson } });
}

export async function getLatestSnapshot(): Promise<{ ts: string; raw_json: string } | null> {
  const row = await getPrisma().networkSnapshot.findFirst({
    orderBy: { id: 'desc' },
    select: { ts: true, rawJson: true },
  });
  return row ? { ts: row.ts.toISOString(), raw_json: row.rawJson } : null;
}
