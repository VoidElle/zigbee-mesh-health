import type { RuntimeStatusSnapshot } from '../../domain/entities';
import type { RuntimeStatusStore } from '../../domain/ports';

export function createGetHealthStatus({ runtime }: { runtime: RuntimeStatusStore }) {
  return {
    getHealthStatus(): RuntimeStatusSnapshot {
      return runtime.snapshot();
    },
  };
}
