import type { EventRepository } from '../../domain/ports';
import type { EventRow, EventType } from '../../domain/entities';

export function createQueryEvents({ events }: { events: EventRepository }) {
  return {
    list(opts?: { type?: EventType; sinceMs?: number; limit?: number }): Promise<EventRow[]> {
      return events.list(opts);
    },
  };
}
