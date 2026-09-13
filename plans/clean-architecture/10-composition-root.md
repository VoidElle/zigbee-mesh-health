# Task 10 — Composition root and entrypoint

**Depends on:** task 09.
**Touches:** `src/composition/container.ts` (final wiring),
`src/composition/main.ts`; `src/index.ts` becomes a re-export/entry shim.

## Goal

Own object construction and process lifecycle in the composition root. This is
the only place that knows every concrete adapter and wires use cases together.

## Files to create / finalize

### `src/composition/container.ts`

Complete the graph seeded in task 04. Build once, bottom-up:

1. **Adapters**
   - `prismaClient` (`getDb`, `getPrisma`, ...)
   - `systemClock`
   - `runtimeStatusStore` / `runtimeStatus`
   - `sampleBus`, `eventBus` (`createInMemoryEventBus`)
   - `sampleRepo`, `eventRepo`, `snapshotRepo`, `stateRepo`, `aliasRepo`,
     `maintenanceRepo`
   - `mqttClient` (`getClient`, lazy)
   - `cronScheduler`
2. **Use cases**
   - `buffer` (`createLinkQualityBuffer`)
   - `ingestLogging`, `ingestBridgeEvent`, `detectBridgeIdentityChange`,
     `recordStateChange`, `recordLinkQualitySample`
   - `computeDeviceHealth`, `queryDeviceHistory`, `queryMeshHistory`,
     `queryEvents`, `queryDevices`, `getLatestNetworkSnapshot`, `manageAliases`,
     `applyRetention`, `getHealthStatus`
   - `meshScanner` (`createMqttMeshScanner`), `networkMapScheduler`
   - `httpServer` (`createHttpServer`)
   - `mqttRouter` (`createMqttMessageRouter`)
3. **Public seam** — re-export the symbols listed in `index.md` under
   "The composition seam", bound to this singleton graph, with the exact original
   names and signatures. Include `container` for direct use.

Wire `pendingResolve`/`inFlight` state only inside `MqttMeshScanner` (single
instance), and `eventBus`/`sampleBus` only from the container (single instance).

### `src/composition/main.ts`

Move `src/index.ts` verbatim, importing from `./container`:

```
startBatchWriter(); startCollectors(); startNetworkmapScheduler();
startRetentionJob(); startApi();
```

Keep the `shuttingDown` guard, `SIGINT`/`SIGTERM` handlers, `stopBatchWriter()`
flush, `getClient().end(false, ...)`, `closePrisma()` and `process.exit(0)`
ordering byte-identical.

### `src/index.ts` (shim until task 11)

```ts
import './composition/main';
```

(`package.json` `main` stays `dist/index.js`; `test/api.test.mjs` spawns
`dist/index.js`, so this path must keep starting the service.)

## Verify

- `npm run build` exits 0.
- `npm test` green, including the spawned-server `api.test.mjs`.

## Done when

`src/index.ts` boots via `composition/main.ts`, all wiring lives in the container,
build + tests green.
