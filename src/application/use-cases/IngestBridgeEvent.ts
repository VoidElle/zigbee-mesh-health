import type { EventRepository } from '../../domain/ports';
import type { EventType } from '../../domain/entities';

// bridge/event payloads: {"type":"device_leave","data":{"friendly_name":..,"ieee_address":..}}
interface BridgeEventPayload {
  type?: unknown;
  data?: {
    friendly_name?: unknown;
    ieee_address?: unknown;
  };
}

export function createIngestBridgeEvent({ events }: { events: EventRepository }) {
  return {
    async handle(payload: Buffer): Promise<void> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (parsed === null || typeof parsed !== 'object') return;
      const obj = parsed as BridgeEventPayload;
      if (typeof obj.type !== 'string') return;
      const data = obj.data ?? {};
      const name =
        typeof data.friendly_name === 'string' && data.friendly_name !== ''
          ? data.friendly_name
          : typeof data.ieee_address === 'string'
            ? data.ieee_address
            : null;
      const type: EventType = obj.type === 'device_leave' ? 'device_leave' : 'other';
      await events.insert(type, name, `bridge event: ${obj.type}${name ? ` '${name}'` : ''}`);
    },
  };
}
