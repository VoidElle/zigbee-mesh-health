import type { MeshScanner } from '../../domain/ports';
import type { CronScheduler } from '../scheduler/CronScheduler';

function parseScheduleToCron(schedule: string): string {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(schedule.trim());
  if (!m) {
    console.warn(
      `[networkmap] invalid NETWORKMAP_SCHEDULE "${schedule}", falling back to 04:00`
    );
    return '0 4 * * *';
  }
  return `${Number(m[2])} ${Number(m[1])} * * *`;
}

export function createNetworkMapScheduler(deps: {
  scanner: MeshScanner;
  schedule: string;
  cron: CronScheduler;
}): { start(): void } {
  let started = false;
  return {
    start(): void {
      if (started) return; // guard: duplicate call would double-schedule the scan
      started = true;
      const expression = parseScheduleToCron(deps.schedule);
      deps.cron.schedule(expression, () => {
        void deps.scanner.request();
      });
      console.log(`[networkmap] scheduler started (${expression}, 1 scan/day max, spec §2)`);
    },
  };
}
