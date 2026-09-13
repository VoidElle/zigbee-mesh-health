import { EventEmitter } from 'node:events';
import { createInMemoryEventBus } from '../infrastructure/messaging/InMemoryEventBus';
import { createPrismaRuntimeStateRepository } from '../infrastructure/persistence/sqlite/PrismaRuntimeStateRepository';
import { createPrismaSampleRepository } from '../infrastructure/persistence/sqlite/PrismaSampleRepository';
import { createPrismaEventRepository } from '../infrastructure/persistence/sqlite/PrismaEventRepository';
import { createPrismaSnapshotRepository } from '../infrastructure/persistence/sqlite/PrismaSnapshotRepository';
import { createPrismaAliasRepository } from '../infrastructure/persistence/sqlite/PrismaAliasRepository';
import { createPrismaMaintenanceRepository } from '../infrastructure/persistence/sqlite/PrismaMaintenanceRepository';
import { systemClock } from '../infrastructure/clock/SystemClock';
import { config } from '../infrastructure/config';
import { runtimeStatusStore } from '../infrastructure/runtime';
import { getClient } from '../infrastructure/messaging/MqttClient';
import { createMqttMessageRouter } from '../infrastructure/messaging/MqttMessageRouter';
import { createLinkQualityBuffer } from '../application/buffer/LinkQualityBuffer';
import { createIngestLogging } from '../application/use-cases/IngestLogging';
import { createIngestBridgeEvent } from '../application/use-cases/IngestBridgeEvent';
import { createDetectBridgeIdentityChange } from '../application/use-cases/DetectBridgeIdentityChange';
import { createRecordStateChange } from '../application/use-cases/RecordStateChange';
import { createRecordLinkQualitySample } from '../application/use-cases/RecordLinkQualitySample';
import { createComputeDeviceHealth } from '../application/use-cases/ComputeDeviceHealth';
import { createQueryDeviceHistory } from '../application/use-cases/QueryDeviceHistory';
import { createQueryMeshHistory } from '../application/use-cases/QueryMeshHistory';
import { createQueryDevices } from '../application/use-cases/QueryDevices';
import { createQueryEvents } from '../application/use-cases/QueryEvents';
import { createGetLatestNetworkSnapshot } from '../application/use-cases/GetLatestNetworkSnapshot';
import { createManageAliases } from '../application/use-cases/ManageAliases';
import { createApplyRetention } from '../application/use-cases/ApplyRetention';
import { createGetHealthStatus } from '../application/use-cases/GetHealthStatus';
import { createRefreshNetworkMap } from '../application/use-cases/RefreshNetworkMap';
import { createCronScheduler } from '../infrastructure/scheduler/CronScheduler';
import { createMqttMeshScanner } from '../infrastructure/networkmap/MqttMeshScanner';
import { createNetworkMapScheduler } from '../infrastructure/networkmap/NetworkMapScheduler';
import { createHttpServer } from '../infrastructure/http/ExpressServer';

// In-process kick channels for the SSE stream: one instance each, re-exported so
// old shims and tests share the exact same emitters the repositories emit on.
// Typed as EventEmitter (the concrete instance) so the untouched SSE server sees
// the full emitter API; both satisfy the narrower EventBus port.
export const sampleBus = createInMemoryEventBus() as EventEmitter;
export const eventBus = createInMemoryEventBus() as EventEmitter;

const stateRepo = createPrismaRuntimeStateRepository();
const sampleRepo = createPrismaSampleRepository();
const eventRepo = createPrismaEventRepository(eventBus);
const snapshotRepo = createPrismaSnapshotRepository();
const aliasRepo = createPrismaAliasRepository(stateRepo);
const maintenanceRepo = createPrismaMaintenanceRepository();

export const listDeviceNames = sampleRepo.listDeviceNames.bind(sampleRepo);
export const latestLqiPerDevice = sampleRepo.latestLqiPerDevice.bind(sampleRepo);
export const avgLqiPerDevice = sampleRepo.avgLqiPerDevice.bind(sampleRepo);

export const insertEvent = eventRepo.insert.bind(eventRepo);
export const failureCountsPerDevice = eventRepo.failureCountsPerDevice.bind(eventRepo);

export const insertSnapshot = snapshotRepo.insert.bind(snapshotRepo);

// Read-side use cases (application), bound to the default repositories.
export const queryDeviceHistory = createQueryDeviceHistory({ samples: sampleRepo });
export const history = queryDeviceHistory.history;
export const queryMeshHistory = createQueryMeshHistory({ samples: sampleRepo });
export const meshHistory = queryMeshHistory.meshHistory;
export const queryDevicesUseCase = createQueryDevices({ samples: sampleRepo, aliases: aliasRepo });
export const queryDevices = queryDevicesUseCase.queryDevices;
export const queryEvents = createQueryEvents({ events: eventRepo });
export const listEvents = queryEvents.list;
export const getLatestNetworkSnapshot = createGetLatestNetworkSnapshot({ snapshots: snapshotRepo });
export const getLatestSnapshot = getLatestNetworkSnapshot.latest;
export const manageAliases = createManageAliases({ aliases: aliasRepo });
export const getAllAliases = manageAliases.getAllAliases;
export const setAlias = manageAliases.setAlias;

// Health computation (application) with thresholds built from config.
export const computeDeviceHealth = createComputeDeviceHealth({
  samples: sampleRepo,
  events: eventRepo,
  thresholds: {
    criticalAbsolute: config.criticalAbsolute,
    warningThresholdPct: config.warningThresholdPct,
    routeFailureCriticalCount: config.routeFailureCriticalCount,
  },
});
export const computeDeviceSummaries = computeDeviceHealth.computeDeviceSummaries;

// Retention (application) over the raw-SQL maintenance adapter.
export const applyRetention = createApplyRetention({
  maintenance: maintenanceRepo,
  clock: systemClock,
  retentionDays: config.retentionDays,
});
export const runRetentionOnce = applyRetention.runRetentionOnce;
export const startRetentionJob = applyRetention.startRetentionJob;

// Runtime status read for /api/health.
export const healthStatus = createGetHealthStatus({ runtime: runtimeStatusStore });
export const getHealthStatus = healthStatus.getHealthStatus;

// Network map (infrastructure): the only publisher of bridge/request/networkmap
// (spec §2). Active scan request/response adapter + cron scheduling.
const cronScheduler = createCronScheduler();
// Lazy client: importing the container must never open a broker connection.
const networkMapClient = {
  subscribe: (topic: string): unknown => getClient().subscribe(topic),
  on: (event: 'message', cb: (topic: string, payload: Buffer) => void): unknown =>
    getClient().on(event, cb),
  publish: (topic: string, payload: string): unknown => getClient().publish(topic, payload),
};
export const meshScanner = createMqttMeshScanner({
  client: networkMapClient,
  snapshots: snapshotRepo,
  runtime: runtimeStatusStore,
  baseTopic: config.baseTopic,
  timeoutMs: config.networkmapTimeoutMs,
});
const networkMapScheduler = createNetworkMapScheduler({
  scanner: meshScanner,
  schedule: config.networkmapSchedule,
  cron: cronScheduler,
});
export const refreshNetworkMap = createRefreshNetworkMap({ scanner: meshScanner });
export const requestNetworkMap = refreshNetworkMap.request;
export const triggerManualRefresh = refreshNetworkMap.triggerManualRefresh;
export const startNetworkmapScheduler = networkMapScheduler.start;

export const getValue = stateRepo.get.bind(stateRepo);
export const setValue = stateRepo.set.bind(stateRepo);
export const withKeyLock = stateRepo.withKeyLock.bind(stateRepo);

// Sample buffer (application) bound to the default repositories + clock.
const linkQualityBuffer = createLinkQualityBuffer({
  samples: sampleRepo,
  bus: sampleBus,
  clock: systemClock,
  flushIntervalMs: config.flushIntervalMs,
  flushBatchSize: config.flushBatchSize,
});

export const enqueueSample = linkQualityBuffer.enqueueSample;
export const flushSamples = linkQualityBuffer.flushSamples;
export const startBatchWriter = linkQualityBuffer.startBatchWriter;
export const stopBatchWriter = linkQualityBuffer.stopBatchWriter;

// HTTP adapter (task 09): thin Express server over the application use cases.
const httpServer = createHttpServer({
  config,
  eventBus,
  sampleBus,
  computeDeviceSummaries,
  getAllAliases,
  setAlias,
  listDeviceNames,
  history,
  meshHistory,
  listEvents,
  getLatestSnapshot,
  triggerManualRefresh,
  getHealthStatus,
});

export const startApi = httpServer.start.bind(httpServer);

// friendly_name -> ieee_address, shared across ingestion use cases. Z2M device
// state messages carry no IEEE address; bridge/devices fills this map.
const ieeeByFriendlyName = new Map<string, string>();
export const setDeviceIeee = (name: string, ieee: string): void => {
  ieeeByFriendlyName.set(name, ieee);
};

// Ingestion use cases, wired for the MQTT router (task 07).
export const ingestLogging = createIngestLogging({ events: eventRepo });
export const ingestBridgeEvent = createIngestBridgeEvent({ events: eventRepo });
export const detectBridgeIdentityChange = createDetectBridgeIdentityChange({
  events: eventRepo,
  state: stateRepo,
  setDeviceIeee,
});
export const recordStateChange = createRecordStateChange({ events: eventRepo, state: stateRepo });
export const recordLinkQualitySample = createRecordLinkQualitySample({
  buffer: linkQualityBuffer,
  runtime: runtimeStatusStore,
  clock: systemClock,
  ieeeLookup: ieeeByFriendlyName,
});

// MQTT adapter (task 07): client stays lazy so importing the container never
// opens a broker connection; the real client is resolved on first subscribe.
const mqttClient = {
  subscribe: (topic: string): unknown => getClient().subscribe(topic),
  on: (event: 'message', cb: (topic: string, payload: Buffer) => void): unknown =>
    getClient().on(event, cb),
};

const mqttRouter = createMqttMessageRouter({
  client: mqttClient,
  baseTopic: config.baseTopic,
  ingestLogging,
  ingestBridgeEvent,
  bridgeIdentity: detectBridgeIdentityChange,
  recordStateChange,
  recordLinkQualitySample,
});

export const startCollectors = mqttRouter.startCollectors;
export const startLqiCollector = mqttRouter.startLqiCollector;
export const startEventCollector = mqttRouter.startEventCollector;
export const handleDeviceMessage = mqttRouter.handleDeviceMessage;
export const handleLogging = mqttRouter.handleLogging;
export const handleBridgeEvent = mqttRouter.handleBridgeEvent;
export const handleInfo = mqttRouter.handleInfo;
export const handleDevices = mqttRouter.handleDevices;

export type { EventRow, EventType } from '../domain/entities';
export { classifyLogging, extractDeviceName } from '../domain/event-classification';

export { config, ensureDataDir, dbFile } from '../infrastructure/config';
export { runtimeStatus } from '../infrastructure/runtime';
export { getClient } from '../infrastructure/messaging/MqttClient';
export { getDb, closeDb, getPrisma, closePrisma } from '../infrastructure/persistence/sqlite/prismaClient';
