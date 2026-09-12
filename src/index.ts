import { startBatchWriter, stopBatchWriter } from './storage/samples';
import { closeDb } from './storage/db';
import { startRetentionJob } from './storage/retention';
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
  stopBatchWriter(); // flush pending samples
  getClient().end(false, () => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
