import type { Clock } from '../../domain/ports';

export const systemClock: Clock = { now: () => Date.now() };
