// !! SPEC §2 — HARD CONSTRAINT !!
// `bridge/request/networkmap` runs an ACTIVE LQI scan: it interrogates every router
// on the mesh, adds radio traffic, and can take minutes on unstable networks.
// Max 1–2 requests/day. Never in a frequent polling loop, not even for debugging.
// This module is the ONLY place in the codebase allowed to publish that topic.
import * as cron from 'node-cron';
import { getClient } from '../mqtt/client';
import { config } from '../config';
import { runtimeStatus } from '../runtime';
import { insertSnapshot } from '../storage/snapshots';

const requestTopic = `${config.baseTopic}/bridge/request/networkmap`;
const responseTopic = `${config.baseTopic}/bridge/response/networkmap`;
const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000; // spec §3.2: min 1h between manual triggers

type MapResult = { ok: boolean; error?: string };

let schedulerStarted = false;
let subscribed = false;
let inFlight: Promise<MapResult> | null = null;
let lastManualAt: number | null = null;
let pendingResolve: ((payload: string) => void) | null = null;

function ensureSubscribed(): void {
  if (subscribed) return; // subscribe once, at init of the first request/scheduler
  subscribed = true;
  const client = getClient();
  client.subscribe(responseTopic);
  client.on('message', (topic, payload) => {
    if (topic !== responseTopic) return;
    const resolve = pendingResolve;
    if (!resolve) return; // stale reply from an already-timed-out request — drop it
    pendingResolve = null;
    resolve(payload.toString());
  });
}

function doRequest(): Promise<MapResult> {
  return new Promise<MapResult>((resolve) => {
    let settled = false;
    const finish = (result: MapResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      // Spec §3.2: on timeout log and give up — NO immediate retry;
      // the next scheduled run retries.
      pendingResolve = null;
      console.error('[networkmap] timeout waiting for bridge response');
      finish({ ok: false, error: 'timeout' });
    }, config.networkmapTimeoutMs);

    pendingResolve = (payload) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        finish({ ok: false, error: 'bad_response' });
        return;
      }
      const obj = parsed as { status?: unknown; error?: unknown };
      if (obj && obj.status === 'error') {
        console.error(`[networkmap] bridge error: ${String(obj.error ?? 'unknown')}`);
        finish({ ok: false, error: 'bridge_error' });
        return;
      }
      insertSnapshot(JSON.stringify(parsed));
      runtimeStatus.lastSnapshotAt = new Date();
      console.log('[networkmap] snapshot saved');
      finish({ ok: true });
    };

    const client = getClient();
    client.publish(requestTopic, 'raw');
    console.log('[networkmap] active scan requested (rare by design, spec §2)');
  });
}

export function requestNetworkMap(forceManual?: boolean): Promise<MapResult> {
  if (inFlight) return Promise.resolve({ ok: false, error: 'in_flight' });
  ensureSubscribed();
  // A manual attempt consumes the rate-limit window even if it then fails,
  // so a failing bridge cannot be hammered.
  if (forceManual) lastManualAt = Date.now();
  inFlight = doRequest();
  inFlight.then(() => {
    inFlight = null;
  });
  return inFlight;
}

export function triggerManualRefresh(): MapResult {
  if (lastManualAt !== null && Date.now() - lastManualAt < MANUAL_RATE_LIMIT_MS) {
    return { ok: false, error: 'rate_limited' };
  }
  if (inFlight) return { ok: false, error: 'in_flight' };
  void requestNetworkMap(true);
  return { ok: true };
}

function parseScheduleToCron(): string {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(config.networkmapSchedule.trim());
  if (!m) {
    console.warn(
      `[networkmap] invalid NETWORKMAP_SCHEDULE "${config.networkmapSchedule}", falling back to 04:00`
    );
    return '0 4 * * *';
  }
  return `${Number(m[2])} ${Number(m[1])} * * *`;
}

export function startNetworkmapScheduler(): void {
  if (schedulerStarted) return; // guard: duplicate call would double-schedule the scan
  schedulerStarted = true;
  const expression = parseScheduleToCron();
  cron.schedule(expression, () => {
    void requestNetworkMap();
  });
  console.log(`[networkmap] scheduler started (${expression}, 1 scan/day max, spec §2)`);
}
