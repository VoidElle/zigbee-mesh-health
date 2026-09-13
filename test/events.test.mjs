// Run after `npm run build`: node --test test/events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshDataDir } from './helpers.mjs';

freshDataDir('mh-events-test-');

const { classifyLogging, extractDeviceName, handleLogging, handleBridgeEvent, handleInfo, handleDevices, handleDeviceMessage, listEvents, insertEvent, eventBus, latestLqiPerDevice, flushSamples } =
  await import('../dist/composition/container.js');

const count = async (type) => (await listEvents({ type })).length;
const buf = (o) => Buffer.from(JSON.stringify(o));
const dev = (o) => Buffer.from(JSON.stringify(o)).toString();

test('event collector + lqi state history', async (t) => {
  await t.test('classify: order + keywords', () => {
    assert.ok(classifyLogging('no network route to device', 'error') === 'route_failure', 'no network route');
    assert.ok(classifyLogging('Failed to route message', 'error') === 'route_failure', 'failed to route');
    assert.ok(classifyLogging('Failed to publish MQTT message', 'error') === 'delivery_failure', 'publish fail');
    assert.ok(classifyLogging("Device 'plug' left the network", 'info') === 'device_leave', 'leave');
    assert.ok(classifyLogging('Starting Zigbee2MQTT', 'info') === 'bridge_restart', 'restart');
    assert.ok(classifyLogging('something broke', 'error') === 'delivery_failure', 'generic error level');
    assert.ok(
      classifyLogging('ezspIncomingRouteRecordHandler: source=51815 relayCount=2', 'debug') === 'other',
      'route record is other'
    );
  });

  await t.test('extractDeviceName', () => {
    assert.ok(extractDeviceName("Device 'plug' left") === 'plug', 'quoted name');
    assert.ok(extractDeviceName('device 0x0015bc001b10033c gone') === '0x0015bc001b10033c', 'ieee name');
    assert.ok(extractDeviceName('no name here') === null, 'no name');
  });

  await t.test('handleLogging: unmatched debug dropped (firehose guard), classified kept', async () => {
    await handleLogging(buf({ level: 'debug', message: 'zh:ember:uart:ash: <--- [FRAME type=DATA]' }));
    assert.ok((await count('other')) === 0, 'unmatched debug must not be stored');
    await handleLogging(buf({ level: 'debug', message: 'Failed to route message to 0x1234' }));
    assert.ok((await count('route_failure')) === 1, 'classified debug kept');
    await handleLogging(buf({ level: 'info', message: "Device 'plug' left the network" }));
    const leave = await listEvents({ type: 'device_leave' });
    assert.ok(leave.length === 1 && leave[0].device_name === 'plug', 'leave event with device name');
    await handleLogging(Buffer.from('not json'));
    assert.ok((await count('other')) === 0, 'invalid JSON ignored');
  });

  await t.test('handleBridgeEvent: structured events', async () => {
    await handleBridgeEvent(buf({ type: 'device_leave', data: { friendly_name: 'plug', ieee_address: '0x1' } }));
    assert.ok((await listEvents({ type: 'device_leave' })).length === 2, 'bridge/event leave');
    await handleBridgeEvent(buf({ type: 'device_joined', data: { ieee_address: '0x0015bc001b10033c' } }));
    const joined = await listEvents({ type: 'other' });
    assert.ok(joined.length === 1 && joined[0].device_name === '0x0015bc001b10033c', 'join as other with ieee');
    await handleBridgeEvent(buf({ type: 'device_leave' })); // no data
    assert.ok((await listEvents({ type: 'device_leave' })).length === 3, 'leave without data');
    await handleBridgeEvent(Buffer.from('not json'));
    assert.ok((await listEvents({ type: 'other' })).length === 1, 'invalid bridge/event JSON ignored');
  });

  await t.test('handleInfo: first sight = anchor, change = version_change, repeat = silent', async () => {
    await handleInfo(buf({ version: '1.40.0' }));
    assert.ok(
      (await count('other')) === 2 && (await listEvents({ type: 'other' }))[0].message.includes('1.40.0'),
      'first info anchor'
    );
    await handleInfo(buf({ version: '1.40.0' }));
    assert.ok((await count('other')) === 2, 'same version silent');
    await handleInfo(buf({ version: '1.41.0' }));
    const vc = await listEvents({ type: 'version_change' });
    assert.ok(vc.length === 1 && vc[0].message.includes('1.40.0'), 'version change logged');
  });

  await t.test('handleDeviceMessage: state-change history on device topics', async () => {
    await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'ON', linkquality: 100 }));
    assert.ok((await count('state_change')) === 0, 'first sight is baseline, no event');
    await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'ON', linkquality: 100 }));
    assert.ok((await count('state_change')) === 0, 'unchanged state no event');
    await handleDeviceMessage('zigbee2mqtt/Luce', dev({ state: 'OFF', linkquality: 90 }));
    const sc = await listEvents({ type: 'state_change' });
    assert.ok(
      sc.length === 1 && sc[0].device_name === 'Luce' && sc[0].message === 'state: ON → OFF',
      'transition logged'
    );
    await handleDeviceMessage('zigbee2mqtt/bridge/state', dev({ state: 'online' }));
    assert.ok((await count('state_change')) === 1, 'bridge/# must not produce state events');
    await handleDeviceMessage('zigbee2mqtt/Sensore', dev({ temperature: 21 }));
    assert.ok((await count('state_change')) === 1, 'payload without state ignored');
  });

  await t.test('handleDevices: retained IEEE map fills samples', async () => {
    handleDevices(
      Buffer.from(
        JSON.stringify([
          { friendly_name: 'Sensore', ieee_address: '0x00158d0001a2b3c4' },
          { friendly_name: '', ieee_address: '0xignored' },
        ])
      )
    );
    await handleDeviceMessage('zigbee2mqtt/Sensore', dev({ linkquality: 42 }));
    await flushSamples();
    const s = (await latestLqiPerDevice()).find((r) => r.name === 'Sensore');
    assert.ok(s && s.ieee === '0x00158d0001a2b3c4', 'ieee resolved from bridge/devices');
    handleDevices(Buffer.from('not json'));
    handleDevices(Buffer.from(JSON.stringify({ not: 'array' })));
  });

  await t.test('concurrent transitions serialise', async () => {
    // Concurrent transitions for a fresh device must serialise: baseline ON, then
    // OFF and ON fired in the same tick without awaiting. A lost-update race would
    // treat OFF's read as the baseline and drop the ON -> OFF event.
    await Promise.all([
      handleDeviceMessage('zigbee2mqtt/race-dev', dev({ state: 'ON' })),
      handleDeviceMessage('zigbee2mqtt/race-dev', dev({ state: 'OFF' })),
    ]);
    const raced = await listEvents({ type: 'state_change' });
    assert.ok(raced.length === 2, `concurrent transitions serialised (got ${raced.length - 1})`);
    assert.ok(
      raced.some((e) => e.device_name === 'race-dev' && e.message === 'state: ON → OFF'),
      'concurrent ON -> OFF logged'
    );
  });

  await t.test('insertEvent emits one eventBus kick (SSE)', async () => {
    let kicks = 0;
    const onKick = () => {
      kicks += 1;
    };
    eventBus.on('event', onKick);
    await insertEvent('other', null, 'sse kick probe');
    await listEvents({ type: 'other' });
    eventBus.off('event', onKick);
    assert.equal(kicks, 1, 'one kick per stored event');
  });
});
