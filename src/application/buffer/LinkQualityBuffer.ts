import type { Clock, EventBus, SampleRepository } from '../../domain/ports';
import type { LinkQualitySample } from '../../domain/entities';

export function createLinkQualityBuffer(deps: {
  samples: SampleRepository;
  bus: EventBus;
  clock: Clock;
  flushIntervalMs: number;
  flushBatchSize: number;
}) {
  let buffer: LinkQualitySample[] = [];
  let timer: NodeJS.Timeout | null = null;

  function enqueueSample(device: string, ieee: string | null, lqi: number): void {
    buffer.push({ device, ieee, lqi, ts: deps.clock.now() });
    if (buffer.length >= deps.flushBatchSize) void flushSamples();
  }

  async function flushSamples(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    await deps.samples.saveBatch(batch);
    deps.bus.emit('sample');
  }

  function startBatchWriter(): void {
    if (timer) return;
    timer = setInterval(() => void flushSamples(), deps.flushIntervalMs);
    timer.unref();
  }

  async function stopBatchWriter(): Promise<void> {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await flushSamples();
  }

  return { enqueueSample, flushSamples, startBatchWriter, stopBatchWriter };
}
