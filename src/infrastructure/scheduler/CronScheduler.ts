import * as cron from 'node-cron';

export interface CronScheduler {
  schedule(expr: string, fn: () => void): void;
}

export function createCronScheduler(): CronScheduler {
  return {
    schedule(expr: string, fn: () => void): void {
      cron.schedule(expr, fn);
    },
  };
}
