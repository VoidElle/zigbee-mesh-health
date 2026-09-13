// Channel 1 (spec §3.1) - passive link-quality collection + state-change history.
// Channel 3 (spec §3.3) - Z2M bridge logging + info ingestion.
// Subscribes only; never publishes.

interface MqttClientLike {
  subscribe(topic: string): unknown;
  on(event: 'message', cb: (topic: string, payload: Buffer) => void): unknown;
}

interface DevicePayload {
  linkquality?: unknown;
  ieee_address?: unknown;
  state?: unknown;
}

export function createMqttMessageRouter(deps: {
  client: MqttClientLike;
  baseTopic: string;
  ingestLogging: { handle(payload: Buffer): Promise<void> };
  ingestBridgeEvent: { handle(payload: Buffer): Promise<void> };
  bridgeIdentity: { handleInfo(p: Buffer): Promise<void>; handleDevices(p: Buffer): void };
  recordStateChange: { handle(device: string, nextState: string): Promise<void> };
  recordLinkQualitySample: {
    handle(device: string, ieeeFromPayload: string | null, lqi: number): void;
  };
}) {
  const { client, baseTopic, ingestLogging, ingestBridgeEvent, bridgeIdentity } = deps;

  let started = false;

  async function handleDeviceMessage(topic: string, payloadStr: string): Promise<void> {
    // Segment(s) after the base topic; bridge/# belongs to channel 3.
    const relative = topic.startsWith(`${baseTopic}/`)
      ? topic.slice(baseTopic.length + 1)
      : topic;
    if (relative.split('/')[0] === 'bridge') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadStr);
    } catch {
      return; // not JSON (e.g. retained non-JSON) - ignore
    }
    if (parsed === null || typeof parsed !== 'object') return;
    const obj = parsed as DevicePayload;

    // friendly_name is the last topic segment.
    const friendlyName = topic.split('/').pop() ?? topic;

    // State-change history: Z2M publishes "state" for switches/lights/plugs;
    // first sight is the baseline (no event), every real transition is one event.
    if (typeof obj.state === 'string' && obj.state !== '') {
      await deps.recordStateChange.handle(friendlyName, obj.state);
    }

    if (typeof obj.linkquality === 'number' && Number.isFinite(obj.linkquality)) {
      const ieee = typeof obj.ieee_address === 'string' ? obj.ieee_address : null;
      deps.recordLinkQualitySample.handle(friendlyName, ieee, obj.linkquality);
    }
  }

  function startLqiCollector(): void {
    client.subscribe(`${baseTopic}/+`);
    client.on('message', (topic, payload) => {
      void handleDeviceMessage(topic, payload.toString()).catch((err) =>
        console.error('[mqtt] device message failed', err)
      );
    });
  }

  async function handleLogging(p: Buffer): Promise<void> {
    await ingestLogging.handle(p);
  }

  async function handleBridgeEvent(p: Buffer): Promise<void> {
    await ingestBridgeEvent.handle(p);
  }

  async function handleInfo(p: Buffer): Promise<void> {
    await bridgeIdentity.handleInfo(p);
  }

  function handleDevices(p: Buffer): void {
    bridgeIdentity.handleDevices(p);
  }

  function logHandlerError(err: unknown): void {
    console.error('[mqtt] bridge handler failed', err);
  }

  function startEventCollector(): void {
    client.subscribe(`${baseTopic}/bridge/logging`);
    client.subscribe(`${baseTopic}/bridge/info`);
    client.subscribe(`${baseTopic}/bridge/event`);
    client.subscribe(`${baseTopic}/bridge/devices`);
    client.on('message', (topic, payload) => {
      if (topic === `${baseTopic}/bridge/logging`) void handleLogging(payload).catch(logHandlerError);
      else if (topic === `${baseTopic}/bridge/info`) void handleInfo(payload).catch(logHandlerError);
      else if (topic === `${baseTopic}/bridge/event`)
        void handleBridgeEvent(payload).catch(logHandlerError);
      else if (topic === `${baseTopic}/bridge/devices`) handleDevices(payload);
    });
  }

  function startCollectors(): void {
    if (started) return; // guard: duplicate call would double-register message handlers
    started = true;
    startLqiCollector();
    startEventCollector();
  }

  return {
    startCollectors,
    startLqiCollector,
    startEventCollector,
    handleDeviceMessage,
    handleLogging,
    handleBridgeEvent,
    handleInfo,
    handleDevices,
  };
}
