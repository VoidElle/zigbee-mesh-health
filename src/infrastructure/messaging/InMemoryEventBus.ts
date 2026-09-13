import { EventEmitter } from 'node:events';
import type { EventBus } from '../../domain/ports';

export function createInMemoryEventBus(): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  return emitter;
}
