import type { EventRepository, RuntimeStateRepository } from '../../domain/ports';

// Last seen state per device (friendly name), persisted so restarts do not miss
// a transition. Only real transitions are logged.
const lastStateKey = (device: string) => `last_state:${device}`;

export function createRecordStateChange({
  events,
  state,
}: {
  events: EventRepository;
  state: RuntimeStateRepository;
}) {
  return {
    // First sight is the baseline (no event), every real transition is one event.
    async handle(device: string, nextState: string): Promise<void> {
      const key = lastStateKey(device);
      await state.withKeyLock(key, async () => {
        const prev = await state.get(key);
        if (prev !== nextState) {
          if (prev !== undefined) {
            await events.insert('state_change', device, `state: ${prev} → ${nextState}`);
          }
          await state.set(key, nextState);
        }
      });
    },
  };
}
