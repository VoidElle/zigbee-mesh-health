import type { Clock, MaintenanceRepository } from '../../domain/ports';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createApplyRetention({
  maintenance,
  clock,
  retentionDays,
}: {
  maintenance: MaintenanceRepository;
  clock: Clock;
  retentionDays: number;
}): { runRetentionOnce(): Promise<void>; startRetentionJob(): void } {
  const runRetentionOnce = (): Promise<void> => {
    const cutoff = new Date(clock.now() - retentionDays * DAY_MS).toISOString();
    return maintenance.applyRetention(cutoff);
  };

  const startRetentionJob = (): void => {
    void runRetentionOnce();
    const t = setInterval(() => void runRetentionOnce(), DAY_MS);
    t.unref();
  };

  return { runRetentionOnce, startRetentionJob };
}
