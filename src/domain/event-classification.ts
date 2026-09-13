import type { EventType } from './entities';

// Classification heuristic, checked in order (first match wins) so that
// route vs delivery failures stay separated:
//   1. route_failure      - message mentions routing/no-route problems
//   2. delivery_failure   - publish/delivery/send errors, or any level==='error'
//                           line that matched nothing above (generic errors)
//   3. device_leave       - device announced leave / left the network
//   4. bridge_restart     - bridge start/restart/shutdown lines
//   5. other              - everything else (kept, never dropped)
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
