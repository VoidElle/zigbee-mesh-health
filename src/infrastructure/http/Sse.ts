import type { Request, Response } from 'express';
import type { EventBus } from '../../domain/ports';

// SSE kick channel: one `data:` per bus emission, heartbeats keep proxies open.
export function sse(req: Request, res: Response, bus: EventBus, event: string): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const onKick = () => res.write('data: 1\n\n');
  bus.on(event, onKick);
  const heartbeat = setInterval(() => res.write(': hb\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off(event, onKick);
  });
}
