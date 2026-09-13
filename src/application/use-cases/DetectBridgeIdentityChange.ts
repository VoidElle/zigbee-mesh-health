import type { EventRepository, RuntimeStateRepository } from '../../domain/ports';

interface InfoPayload {
  version?: unknown;
  coordinator?: {
    type?: unknown;
    meta?: unknown;
  };
}

// bridge/devices is a retained array of every known device, including
// friendly_name + ieee_address. Replayed on subscribe, so already-connected
// devices are covered too. Feeds the friendly_name -> IEEE map used by
// channel 1 (device state messages carry no IEEE address).
interface BridgeDevice {
  friendly_name?: unknown;
  ieee_address?: unknown;
}

export function createDetectBridgeIdentityChange(deps: {
  events: EventRepository;
  state: RuntimeStateRepository;
  setDeviceIeee: (name: string, ieee: string) => void;
}) {
  return {
    handleDevices(payload: Buffer): void {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (!Array.isArray(parsed)) return;
      for (const item of parsed as BridgeDevice[]) {
        if (
          typeof item.friendly_name === 'string' &&
          item.friendly_name !== '' &&
          typeof item.ieee_address === 'string'
        ) {
          deps.setDeviceIeee(item.friendly_name, item.ieee_address);
        }
      }
    },

    async handleInfo(payload: Buffer): Promise<void> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString());
      } catch {
        return;
      }
      if (parsed === null || typeof parsed !== 'object') return;
      const info = parsed as InfoPayload;

      await deps.state.withKeyLock('last_z2m_version', async () => {
        const last = await deps.state.get('last_z2m_version');
        if (typeof info.version === 'string' && info.version !== last) {
          if (last === undefined) {
            // First sight after startup: anchor event so the log is non-empty
            // on a healthy mesh (changes-only would stay silent forever).
            await deps.events.insert('other', null, `Z2M bridge online, version ${info.version}`);
          } else {
            await deps.events.insert(
              'version_change',
              null,
              `Z2M version changed: ${last} → ${info.version}`
            );
          }
          await deps.state.set('last_z2m_version', info.version);
        }
      });

      // Best-effort coordinator identity: type string, else whole coordinator meta.
      const coord =
        typeof info.coordinator?.type === 'string'
          ? info.coordinator.type
          : info.coordinator !== undefined
            ? JSON.stringify(info.coordinator)
            : undefined;
      if (coord !== undefined) {
        await deps.state.withKeyLock('last_coordinator', async () => {
          const last = await deps.state.get('last_coordinator');
          if (coord !== last) {
            if (last !== undefined) {
              await deps.events.insert(
                'version_change',
                null,
                `Coordinator changed: ${last} → ${coord}`
              );
            }
            await deps.state.set('last_coordinator', coord);
          }
        });
      }
    },
  };
}
