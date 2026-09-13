import {
  startBatchWriter,
  stopBatchWriter,
  closePrisma,
  startRetentionJob,
  startCollectors,
  getClient,
  startNetworkmapScheduler,
  startApi,
} from './container';

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
