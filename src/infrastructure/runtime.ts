import type { RuntimeStatusStore } from '../domain/ports';

// Mutable singleton updated by collectors/networkmap manager, read by /api/health.
export const runtimeStatus: {
  mqttConnected: boolean;
  lastSampleAt: Date | null;
  lastSnapshotAt: Date | null;
} = {
  mqttConnected: false,
  lastSampleAt: null,
  lastSnapshotAt: null,
};

export const runtimeStatusStore: RuntimeStatusStore = {
  snapshot: () => ({
    mqttConnected: runtimeStatus.mqttConnected,
    lastSampleAt: runtimeStatus.lastSampleAt,
    lastSnapshotAt: runtimeStatus.lastSnapshotAt,
  }),
  setMqttConnected: (v) => {
    runtimeStatus.mqttConnected = v;
  },
  markSampleAt: (d) => {
    runtimeStatus.lastSampleAt = d;
  },
  markSnapshotAt: (d) => {
    runtimeStatus.lastSnapshotAt = d;
  },
};
