import { getPrisma } from './prismaClient';
import type { EventBus, EventRepository } from '../../../domain/ports';
import type { EventRow, EventType } from '../../../domain/entities';

export function createPrismaEventRepository(bus: EventBus): EventRepository {
  return {
    async insert(type: EventType, device: string | null, message: string): Promise<void> {
      await getPrisma().logEvent.create({
        data: { ts: new Date(), eventType: type, deviceName: device, message },
      });
      bus.emit('event');
    },

    async list({
      type,
      sinceMs,
      limit = 200,
    }: { type?: EventType; sinceMs?: number; limit?: number } = {}): Promise<EventRow[]> {
      const where = {
        ...(type ? { eventType: type } : {}),
        ...(sinceMs !== undefined ? { ts: { gte: new Date(Date.now() - sinceMs) } } : {}),
      };
      const rows = await getPrisma().logEvent.findMany({
        where,
        orderBy: [{ ts: 'desc' }, { id: 'desc' }],
        take: limit,
        select: { id: true, ts: true, eventType: true, deviceName: true, message: true },
      });
      return rows.map((r) => ({
        id: r.id,
        ts: r.ts.toISOString(),
        event_type: r.eventType as EventType,
        device_name: r.deviceName,
        message: r.message,
      }));
    },

    async failureCountsPerDevice(sinceMs: number): Promise<Map<string, number>> {
      const rows = await getPrisma().logEvent.groupBy({
        by: ['deviceName'],
        where: {
          eventType: { in: ['route_failure', 'delivery_failure'] },
          ts: { gte: new Date(Date.now() - sinceMs) },
          deviceName: { not: null },
        },
        _count: true,
      });
      // groupBy result keeps deviceName nullable despite the filter; _count is a number.
      return new Map(rows.map((r) => [r.deviceName as string, r._count]));
    },
  };
}
