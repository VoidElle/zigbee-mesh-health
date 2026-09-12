// Run after `npm run build`: node scripts/test-events.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'mh-events-test-'));

const { classifyLogging, extractDeviceName, handleLogging, handleBridgeEvent, handleInfo } =
  await import('../dist/mqtt/eventCollector.js');
const { handleDeviceMessage } = await import('../dist/mqtt/lqiCollector.js');
const { listEvents } = await import('../dist/db/repositories/events.js');

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
};
const count = async (type) => (await listEvents({ type })).length;
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
await handleLogging(buf({ level: 'debug', message: 'zh:ember:uart:ash: <--- [FRAME type=DATA]' }));
assert((await count('other')) === 0, 'unmatched debug must not be stored');
await handleLogging(buf({ level: 'debug', message: 'Failed to route message to 0x1234' }));
assert((await count('route_failure')) === 1, 'classified debug kept');
await handleLogging(buf({ level: 'info', message: "Device 'plug' left the network" }));
const leave = await listEvents({ type: 'device_leave' });
assert(leave.length === 1 && leave[0].device_name === 'plug', 'leave event with device name');
await handleLogging(Buffer.from('not json'));
assert((await count('other')) === 0, 'invalid JSON ignored');

// handleBridgeEvent: structured events
await handleBridgeEvent(buf({ type: 'device_leave', data: { friendly_name: 'plug', ieee_address: '0x1' } }));
assert((await listEvents({ type: 'device_leave' })).length === 2, 'bridge/event leave');
await handleBridgeEvent(buf({ type: 'device_joined', data: { ieee_address: '0x0015bc001b10033c' } }));
const joined = await listEvents({ type: 'other' });
assert(joined.length === 1 && joined[0].device_name === '0x0015bc001b10033c', 'join as other with ieee');
await handleBridgeEvent(buf({ type: 'device_leave' })); // no data
assert((await listEvents({ type: 'device_leave' })).length === 3, 'leave without data');
await handleBridgeEvent(Buffer.from('not json'));
assert((await listEvents({ type: 'other' })).length === 1, 'invalid bridge/event JSON ignored');

// handleInfo: first sight = anchor, change = version_change, repeat = silent
await handleInfo(buf({ version: '1.40.0' }));
assert((await count('other')) === 2 && (await listEvents({ type: 'other' }))[0].message.includes('1.40.0'), 'first info anchor');
await handleInfo(buf({ version: '1.40.0' }));
assert((await count('other')) === 2, 'same version silent');
await handleInfo(buf({ version: '1.41.0' }));
const vc = await listEvents({ type: 'version_change' });
assert(vc.length === 1 && vc[0].message.includes('1.40.0'), 'version change logged');

// handleDeviceMessage: state-change history on device topics
const dev = (o) => Buffer.from(JSON.stringify(o)).toString();
await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'ON', linkquality: 100 }));
assert((await count('state_change')) === 0, 'first sight is baseline, no event');
await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'ON', linkquality: 100 }));
assert((await count('state_change')) === 0, 'unchanged state no event');
await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'OFF', linkquality: 90 }));
const sc = await listEvents({ type: 'state_change' });
assert(sc.length === 1 && sc[0].device_name === 'Luce' && sc[0].message === 'state: ON → OFF', 'transition logged');
await handleDeviceMessage('zigbee2mqtt/bridge/state', dev({ state: 'online' }));
assert((await count('state_change')) === 1, 'bridge/# must not produce state events');
await handleDeviceMessage('zigbee2mqtt/Sensore', dev({ temperature: 21 }));
assert((await count('state_change')) === 1, 'payload without state ignored');

// Concurrent transitions for a fresh device must serialise: baseline ON, then
// OFF and ON fired in the same tick without awaiting. A lost-update race would
// treat OFF's read as the baseline and drop the ON -> OFF event.
await Promise.all([
  handleDeviceMessage('zigbee2mqtt/race-dev', dev({ state: 'ON' })),
  handleDeviceMessage('zigbee2mqtt/race-dev', dev({ state: 'OFF' })),
]);
const raced = await listEvents({ type: 'state_change' });
assert(raced.length === 2, `concurrent transitions serialised (got ${raced.length - 1})`);
assert(
  raced.some((e) => e.device_name === 'race-dev' && e.message === 'state: ON → OFF'),
  'concurrent ON -> OFF logged'
);

console.log('events.test OK');
