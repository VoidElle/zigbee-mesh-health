import { EventEmitter } from 'node:events';
import { getPrisma } from '../client';

// In-process kick channel for the SSE stream: fires once per stored event.
// No payload - the frontend re-fetches with its current filter on each kick.
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(0);

export type EventType =
  | 'route_failure'
  | 'delivery_failure'
  | 'device_leave'
  | 'bridge_restart'
  | 'version_change'
  | 'state_change'
  | 'other';

export async function insertEvent(
  type: EventType,
  device: string | null,
  message: string
): Promise<void> {
  await getPrisma().logEvent.create({
    data: { ts: new Date(), eventType: type, deviceName: device, message },
  });
  eventBus.emit('event');
}

export interface ListEventsOptions {
  type?: EventType;
  sinceMs?: number;
  limit?: number;
}

export interface EventRow {
  id: number;
  ts: string;
  event_type: EventType;
  device_name: string | null;
  message: string | null;
}

export async function listEvents({
  type,
  sinceMs,
  limit = 200,
}: ListEventsOptions = {}): Promise<EventRow[]> {
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
}
