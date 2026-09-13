# Task 07 — Infrastructure: messaging (MQTT client + router)

**Depends on:** task 06.
**Touches:** `infrastructure/messaging/MqttClient.ts`,
`infrastructure/messaging/MqttMessageRouter.ts`; shims for all `src/mqtt/*`.

## Goal

Turn the MQTT collectors into thin infrastructure adapters: one client factory,
one router that maps topics to application use cases. No business rules here.

## Files to create

### `src/infrastructure/messaging/MqttClient.ts`

Move `src/mqtt/client.ts` verbatim. Fix imports:
- `../config` → `../config`
- `../runtime` → `../runtime` (use `runtimeStatusStore.setMqttConnected`)
Update the connect/reconnect/close/offline handlers to call
`runtimeStatusStore.setMqttConnected(true/false)`. Keep the error log format
`[mqtt] <message>` and the `getClient()` singleton. Exports `getClient` unchanged.

### `src/infrastructure/messaging/MqttMessageRouter.ts`

Own topic subscription and dispatch only. It receives the wired use cases and the
IEEE map, and registers exactly one `client.on('message')` per subsystem as today.

Responsibilities (copy from `src/mqtt/lqiCollector.ts` + `eventCollector.ts`):

- `startCollectors()`: guard against double start; subscribe to
  `${baseTopic}/+` (device channel), and
  `${baseTopic}/bridge/logging|info|event|devices`.
- Device channel (`source src/mqtt/lqiCollector.ts:30-47`): early-return when the
  first relative segment is `bridge`; then run `RecordStateChange` and
  `RecordLinkQualitySample`. The `bridge/#` guard stays here (it is topic
  routing, not business logic).
- Bridge channel: dispatch to `IngestLogging`, `DetectBridgeIdentityChange`
  (`handleInfo`, `handleDevices`), `IngestBridgeEvent`; wrapped with the existing
  `[mqtt] bridge handler failed` /
  `[mqtt] device message failed` error logging.
- Owns the `ieeeByFriendlyName` map + `setDeviceIeee` (currently
  `src/mqtt/lqiCollector.ts:24-28`); injects it into
  `RecordLinkQualitySample` and `DetectBridgeIdentityChange`.

```ts
export function createMqttMessageRouter(deps: {
  client: MqttClient;
  baseTopic: string;
  ingestLogging: { handle(payload: Buffer): Promise<void> };
  ingestBridgeEvent: { handle(payload: Buffer): Promise<void> };
  bridgeIdentity: { handleInfo(p: Buffer): Promise<void>; handleDevices(p: Buffer): void };
  ingestDeviceMessage: { handle(topic: string, payload: string): Promise<void> };
}) {
  return { startCollectors(): void; setDeviceIeee(name: string, ieee: string): void };
}
```

## Shims

- `src/mqtt/client.ts` → `export * from '../infrastructure/messaging/MqttClient';`
- `src/mqtt/index.ts` → re-export `startCollectors` bound to the container.
- `src/mqtt/eventCollector.ts` → re-export `classifyLogging`, `extractDeviceName`
  (from domain) and `handleLogging`, `handleBridgeEvent`, `handleInfo`,
  `handleDevices`, `startEventCollector` bound to the container.
- `src/mqtt/lqiCollector.ts` → re-export `handleDeviceMessage`,
  `startLqiCollector`, `setDeviceIeee` bound to the container.

Tests `test/events.test.mjs` import `handleLogging` etc. from
`../dist/mqtt/eventCollector.js`; the shim keeps those names working.

## Verify

- `npm run build` exits 0.
- `npm test` green — `test/events.test.mjs` exercises all handlers and the
  bridge-guard.

## Done when

MQTT logic is adapter-only, all `src/mqtt/*` paths are shims, build + tests green.
