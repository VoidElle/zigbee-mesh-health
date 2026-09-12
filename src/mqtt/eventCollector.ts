import { getClient } from './client';
import { config } from '../config';
import { insertEvent, type EventType } from '../storage/events';

// Channel 3 (spec §3.3) — Z2M bridge logging + info ingestion.
// Subscribes only; never publishes.

interface LoggingPayload {
  level?: unknown;
  message?: unknown;
}

interface InfoPayload {
  version?: unknown;
  coordinator?: {
    type?: unknown;
    meta?: unknown;
  };
}

// bridge/event payloads: {"type":"device_leave","data":{"friendly_name":..,"ieee_address":..}}
interface BridgeEventPayload {
  type?: unknown;
  data?: {
    friendly_name?: unknown;
    ieee_address?: unknown;
  };
}

// Last-seen versions (in-memory) for change detection on bridge/info.
let lastZ2mVersion: string | undefined;
let lastCoordinator: string | undefined;

// Classification heuristic, checked in order (first match wins) so that
// route vs delivery failures stay separated:
//   1. route_failure      — message mentions routing/no-route problems
//   2. delivery_failure   — publish/delivery/send errors, or any level==='error'
//                           line that matched nothing above (generic errors)
//   3. device_leave       — device announced leave / left the network
//   4. bridge_restart     — bridge start/restart/shutdown lines
//   5. other              — everything else (kept, never dropped)
export function classifyLogging(message: string, level: string): EventType {
  const l = message.toLowerCase();
  if (/(no network route|route (error|fail|routing)|(failed|unable) to route|routing (error|fail|lost))/.test(l)) {
    return 'route_failure';
  }
  if (/(publish|delivery|send|deliver)[^a-z]*(error|fail)|failed to (publish|send)|error while publishing/.test(l)) {
    return 'delivery_failure';
  }
  if (/(left the network|leaving the network|announced leave|device leave)/.test(l)) {
    return 'device_leave';
  }
  if (/(restart|starting|shutdown)/.test(l)) {
    return 'bridge_restart';
  }
  if (level === 'error') {
    return 'delivery_failure';
  }
  return 'other';
}

// Best-effort device name extraction from a log line: Z2M usually quotes
// the friendly name or includes the IEEE address (0x + 16 hex digits).
export function extractDeviceName(message: string): string | null {
  const quoted = /'([^']+)'/.exec(message);
  if (quoted) return quoted[1];
  const ieee = /0x[0-9a-fA-F]{16}/.exec(message);
  return ieee ? ieee[0] : null;
}

export function handleLogging(payload: Buffer): void {
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
  const device =
    type === 'device_leave' ? extractDeviceName(obj.message) : null;
  // message = original log line (spec: correlation happens later, raw line kept).
  insertEvent(type, device, obj.message);
}

// bridge/event is published by Z2M for every device lifecycle change
// (join, leave, announce, interview) — structured JSON, no Z2M config needed.
export function handleBridgeEvent(payload: Buffer): void {
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
  insertEvent(type, name, `bridge event: ${obj.type}${name ? ` '${name}'` : ''}`);
}

export function handleInfo(payload: Buffer): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString());
  } catch {
    return;
  }
  if (parsed === null || typeof parsed !== 'object') return;
  const info = parsed as InfoPayload;

  if (typeof info.version === 'string' && info.version !== lastZ2mVersion) {
    if (lastZ2mVersion === undefined) {
      // First sight after startup: anchor event so the log is non-empty
      // on a healthy mesh (changes-only would stay silent forever).
      insertEvent('other', null, `Z2M bridge online, version ${info.version}`);
    } else {
      insertEvent(
        'version_change',
        null,
        `Z2M version changed: ${lastZ2mVersion} → ${info.version}`
      );
    }
    lastZ2mVersion = info.version;
  }

  // Best-effort coordinator identity: type string, else whole coordinator meta.
  const coord =
    typeof info.coordinator?.type === 'string'
      ? info.coordinator.type
      : info.coordinator !== undefined
        ? JSON.stringify(info.coordinator)
        : undefined;
  if (coord !== undefined && coord !== lastCoordinator) {
    if (lastCoordinator !== undefined) {
      insertEvent(
        'version_change',
        null,
        `Coordinator changed: ${lastCoordinator} → ${coord}`
      );
    }
    lastCoordinator = coord;
  }
}

export function startEventCollector(): void {
  const client = getClient();
  client.subscribe(`${config.baseTopic}/bridge/logging`);
  client.subscribe(`${config.baseTopic}/bridge/info`);
  client.subscribe(`${config.baseTopic}/bridge/event`);
  client.on('message', (topic, payload) => {
    if (topic === `${config.baseTopic}/bridge/logging`) handleLogging(payload);
    else if (topic === `${config.baseTopic}/bridge/info`) handleInfo(payload);
    else if (topic === `${config.baseTopic}/bridge/event`) handleBridgeEvent(payload);
  });
}
