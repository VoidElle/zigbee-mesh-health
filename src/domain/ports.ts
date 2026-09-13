import type {
  EventRow, EventType, LatestLinkQuality, LinkQualityPoint, LinkQualitySample,
  ManualRefreshResult, MeshBucket, MeshScanResult, NetworkSnapshotRecord,
  RuntimeStatusSnapshot,
} from './entities';

export interface SampleRepository {
  saveBatch(samples: LinkQualitySample[]): Promise<void>;
  history(device: string, sinceMs: number): Promise<LinkQualityPoint[]>;
  meshHistory(sinceMs: number): Promise<MeshBucket[]>;
  listDeviceNames(): Promise<string[]>;
  latestLqiPerDevice(): Promise<LatestLinkQuality[]>;
  avgLqiPerDevice(sinceMs: number): Promise<Map<string, number>>;
}

export interface EventRepository {
  insert(type: EventType, device: string | null, message: string): Promise<void>;
  list(opts?: { type?: EventType; sinceMs?: number; limit?: number }): Promise<EventRow[]>;
  failureCountsPerDevice(sinceMs: number): Promise<Map<string, number>>;
}

export interface MaintenanceRepository {
  applyRetention(cutoffIso: string): Promise<void>;
}

export interface SnapshotRepository {
  insert(rawJson: string): Promise<void>;
  latest(): Promise<NetworkSnapshotRecord | null>;
}

export interface AliasRepository {
  getAll(): Promise<Map<string, string>>;
  set(name: string, alias: string | null): Promise<void>;
}

export interface RuntimeStateRepository {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

export interface EventBus {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  emit(event: string): void;
}

export interface Clock { now(): number }

export interface RuntimeStatusStore {
  snapshot(): RuntimeStatusSnapshot;
  setMqttConnected(v: boolean): void;
  markSampleAt(d: Date): void;
  markSnapshotAt(d: Date): void;
}

export interface MeshScanner {
  request(forceManual?: boolean): Promise<MeshScanResult>;
  triggerManualRefresh(): ManualRefreshResult;
}
