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
