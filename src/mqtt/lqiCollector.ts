import { getClient } from './client';
import { config } from '../config';
import { runtimeStatus } from '../runtime';
import { enqueueSample } from '../storage/samples';
import { insertEvent } from '../storage/events';

// Channel 1 (spec §3.1) — passive link-quality collection + state-change history.
// Subscribes to <baseTopic>/+ and never publishes anything.

interface DevicePayload {
  linkquality?: unknown;
  ieee_address?: unknown;
  state?: unknown;
}

// Last seen state per device (friendly name). Only real transitions are logged.
// ponytail: in-memory — one transition per device can be missed across app restarts;
// persist last_states to a table if restart-time continuity matters.
const lastStates = new Map<string, string>();

export function handleDeviceMessage(topic: string, payloadStr: string): void {
  // Segment(s) after the base topic; bridge/# belongs to channel 3.
  const relative = topic.startsWith(`${config.baseTopic}/`)
    ? topic.slice(config.baseTopic.length + 1)
    : topic;
  if (relative.split('/')[0] === 'bridge') return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadStr);
  } catch {
    return; // not JSON (e.g. retained non-JSON) — ignore
  }
  if (parsed === null || typeof parsed !== 'object') return;
  const obj = parsed as DevicePayload;

  // friendly_name is the last topic segment.
  const friendlyName = topic.split('/').pop() ?? topic;

  // State-change history: Z2M publishes "state" for switches/lights/plugs;
  // first sight is the baseline (no event), every real transition is one event.
  if (typeof obj.state === 'string' && obj.state !== '' && lastStates.get(friendlyName) !== obj.state) {
    const prev = lastStates.get(friendlyName);
    if (prev !== undefined) {
      insertEvent('state_change', friendlyName, `state: ${prev} → ${obj.state}`);
    }
    lastStates.set(friendlyName, obj.state);
  }

  if (typeof obj.linkquality === 'number' && Number.isFinite(obj.linkquality)) {
    const ieee = typeof obj.ieee_address === 'string' ? obj.ieee_address : null;
    enqueueSample(friendlyName, ieee, obj.linkquality);
    runtimeStatus.lastSampleAt = new Date();
  }
}

export function startLqiCollector(): void {
  const client = getClient();
  client.subscribe(`${config.baseTopic}/+`);
  client.on('message', (topic, payload) => {
    handleDeviceMessage(topic, payload.toString());
  });
}
