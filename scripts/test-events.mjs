// Run after `npm run build`: node scripts/test-events.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'mh-events-test-'));

const { classifyLogging, extractDeviceName, handleLogging, handleBridgeEvent, handleInfo } =
  await import('../dist/mqtt/eventCollector.js');
const { listEvents } = await import('../dist/storage/events.js');

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
};
const count = (type) => listEvents({ type }).length;
const buf = (o) => Buffer.from(JSON.stringify(o));

// classify: order + keywords
assert(classifyLogging('no network route to device', 'error') === 'route_failure', 'no network route');
assert(classifyLogging('Failed to route message', 'error') === 'route_failure', 'failed to route');
assert(classifyLogging('Failed to publish MQTT message', 'error') === 'delivery_failure', 'publish fail');
assert(classifyLogging("Device 'plug' left the network", 'info') === 'device_leave', 'leave');
assert(classifyLogging('Starting Zigbee2MQTT', 'info') === 'bridge_restart', 'restart');
assert(classifyLogging('something broke', 'error') === 'delivery_failure', 'generic error level');
assert(classifyLogging('ezspIncomingRouteRecordHandler: source=51815 relayCount=2', 'debug') === 'other', 'route record is other');

// extractDeviceName
assert(extractDeviceName("Device 'plug' left") === 'plug', 'quoted name');
assert(extractDeviceName('device 0x0015bc001b10033c gone') === '0x0015bc001b10033c', 'ieee name');
assert(extractDeviceName('no name here') === null, 'no name');

// handleLogging: unmatched debug dropped (firehose guard), classified kept
handleLogging(buf({ level: 'debug', message: 'zh:ember:uart:ash: <--- [FRAME type=DATA]' }));
assert(count('other') === 0, 'unmatched debug must not be stored');
handleLogging(buf({ level: 'debug', message: 'Failed to route message to 0x1234' }));
assert(count('route_failure') === 1, 'classified debug kept');
handleLogging(buf({ level: 'info', message: "Device 'plug' left the network" }));
const leave = listEvents({ type: 'device_leave' });
assert(leave.length === 1 && leave[0].device_name === 'plug', 'leave event with device name');
handleLogging(Buffer.from('not json'));
assert(count('other') === 0, 'invalid JSON ignored');

// handleBridgeEvent: structured events
handleBridgeEvent(buf({ type: 'device_leave', data: { friendly_name: 'plug', ieee_address: '0x1' } }));
assert(listEvents({ type: 'device_leave' }).length === 2, 'bridge/event leave');
handleBridgeEvent(buf({ type: 'device_joined', data: { ieee_address: '0x0015bc001b10033c' } }));
const joined = listEvents({ type: 'other' });
assert(joined.length === 1 && joined[0].device_name === '0x0015bc001b10033c', 'join as other with ieee');
handleBridgeEvent(buf({ type: 'device_leave' })); // no data
assert(listEvents({ type: 'device_leave' }).length === 3, 'leave without data');
handleBridgeEvent(Buffer.from('not json'));
assert(listEvents({ type: 'other' }).length === 1, 'invalid bridge/event JSON ignored');

// handleInfo: first sight = anchor, change = version_change, repeat = silent
handleInfo(buf({ version: '1.40.0' }));
assert(count('other') === 2 && listEvents({ type: 'other' })[0].message.includes('1.40.0'), 'first info anchor');
handleInfo(buf({ version: '1.40.0' }));
assert(count('other') === 2, 'same version silent');
handleInfo(buf({ version: '1.41.0' }));
const vc = listEvents({ type: 'version_change' });
assert(vc.length === 1 && vc[0].message.includes('1.40.0'), 'version change logged');

console.log('events.test OK');
