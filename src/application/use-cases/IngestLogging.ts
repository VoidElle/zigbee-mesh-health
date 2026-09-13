import type { EventRepository } from '../../domain/ports';
import { classifyLogging, extractDeviceName } from '../../domain/event-classification';

interface LoggingPayload {
  level?: unknown;
  message?: unknown;
}

export function createIngestLogging({ events }: { events: EventRepository }) {
  return {
    async handle(payload: Buffer): Promise<void> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (parsed === null || typeof parsed !== 'object') return;
      const obj = parsed as LoggingPayload;
      if (typeof obj.message !== 'string') return;
      const level = typeof obj.level === 'string' ? obj.level : '';
      const type = classifyLogging(obj.message, level);
      // With log.output mqtt + debug level, bridge/logging is a firehose
      // (EZSP frames, ASH acks, ...): keep classified events, drop unmatched debug.
      if (type === 'other' && level === 'debug') return;
      const device = type === 'device_leave' ? extractDeviceName(obj.message) : null;
      // message = original log line (spec: correlation happens later, raw line kept).
      await events.insert(type, device, obj.message);
    },
  };
}
