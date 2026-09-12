import { startLqiCollector } from './lqiCollector';
import { startEventCollector } from './eventCollector';

let started = false;

// Wires channels 1 and 3 (passive only; networkmap is task 03).
export function startCollectors(): void {
  if (started) return; // guard: duplicate call would double-register message handlers
  started = true;
  startLqiCollector();
  startEventCollector();
}
