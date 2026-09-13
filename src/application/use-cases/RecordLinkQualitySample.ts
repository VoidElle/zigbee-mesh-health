import type { Clock, RuntimeStatusStore } from '../../domain/ports';
import type { createLinkQualityBuffer } from '../buffer/LinkQualityBuffer';

export function createRecordLinkQualitySample(deps: {
  buffer: ReturnType<typeof createLinkQualityBuffer>;
  runtime: RuntimeStatusStore;
  clock: Clock;
  ieeeLookup: Map<string, string>;
}) {
  return {
    handle(device: string, ieeeFromPayload: string | null, lqi: number): Promise<void> | void {
      const ieee = ieeeFromPayload ?? deps.ieeeLookup.get(device) ?? null;
      deps.buffer.enqueueSample(device, ieee, lqi);
      deps.runtime.markSampleAt(new Date(deps.clock.now()));
    },
  };
}
