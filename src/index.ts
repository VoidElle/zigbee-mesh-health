import { startBatchWriter, stopBatchWriter } from './db/repositories/samples';
import { closePrisma } from './db/client';
import { startRetentionJob } from './db/repositories/retention';
import { startCollectors } from './mqtt';
import { getClient } from './mqtt/client';
import { startNetworkmapScheduler } from './networkmap';
import { startApi } from './api/server';

startBatchWriter();
startCollectors();
startNetworkmapScheduler();
startRetentionJob();
startApi();
console.log('[mesh-health] service started');

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[mesh-health] shutting down');
  void (async () => {
    await stopBatchWriter(); // flush pending samples
    getClient().end(false, () => {
      void closePrisma().finally(() => process.exit(0));
    });
  })();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
