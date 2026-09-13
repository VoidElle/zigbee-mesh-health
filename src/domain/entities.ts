export type DeviceStatus = 'ok' | 'warning' | 'critical';

export interface DeviceSummary {
  name: string;
  ieee: string | null;
  currentLqi: number;
  status: DeviceStatus;
  avg24h: number | null;
  avg7d: number | null;
  failures24h: number;
  lastSeen: string | null;
}

export type EventType =
  | 'route_failure' | 'delivery_failure' | 'device_leave'
  | 'bridge_restart' | 'version_change' | 'state_change' | 'other';

export interface EventRow {
  id: number;
  ts: string;
  event_type: EventType;
  device_name: string | null;
  message: string | null;
}

export interface LinkQualitySample {
  device: string;
  ieee: string | null;
  lqi: number;
  ts: number;            // epoch ms, as buffered today
}

export interface LinkQualityPoint { lqi: number; ts: string }
export interface LatestLinkQuality { name: string; ieee: string | null; lqi: number; ts: string }
export interface MeshBucket { ts: string; lqi: number; n: number }
export interface NetworkSnapshotRecord { ts: string; raw_json: string }
export interface RuntimeStatusSnapshot {
  mqttConnected: boolean;
  lastSampleAt: Date | null;
  lastSnapshotAt: Date | null;
}
export type MeshScanResult = { ok: boolean; error?: string };
export type ManualRefreshResult = { ok: boolean; error?: string; promise?: Promise<MeshScanResult> };
