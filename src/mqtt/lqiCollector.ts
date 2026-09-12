import { getClient } from './client';
import { config } from '../config';
import { runtimeStatus } from '../runtime';
import { enqueueSample } from '../storage/samples';

// Channel 1 (spec §3.1) — passive link-quality collection.
// Subscribes to <baseTopic>/+ and never publishes anything.

interface DevicePayload {
  linkquality?: unknown;
  ieee_address?: unknown;
}

export function startLqiCollector(): void {
  const client = getClient();
  client.subscribe(`${config.baseTopic}/+`);
  client.on('message', (topic, payload) => {
    // Segment(s) after the base topic; bridge/# belongs to channel 3.
    const relative = topic.startsWith(`${config.baseTopic}/`)
      ? topic.slice(config.baseTopic.length + 1)
      : topic;
    if (relative.split('/')[0] === 'bridge') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString());
    } catch {
      return; // not JSON (e.g. retained non-JSON) — ignore
    }
    if (parsed === null || typeof parsed !== 'object') return;
    const obj = parsed as DevicePayload;
    if (typeof obj.linkquality !== 'number' || !Number.isFinite(obj.linkquality)) return;

    // friendly_name is the last topic segment.
    const friendlyName = topic.split('/').pop() ?? topic;
    const ieee = typeof obj.ieee_address === 'string' ? obj.ieee_address : null;
    enqueueSample(friendlyName, ieee, obj.linkquality);
    runtimeStatus.lastSampleAt = new Date();
  });
}
