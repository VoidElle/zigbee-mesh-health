// !! SPEC §2 - HARD CONSTRAINT !!
// `bridge/request/networkmap` runs an ACTIVE LQI scan: it interrogates every router
// on the mesh, adds radio traffic, and can take minutes on unstable networks.
// Max 1–2 requests/day. Never in a frequent polling loop, not even for debugging.
// This module is the ONLY place in the codebase allowed to publish that topic.
import type { MeshScanner, RuntimeStatusStore, SnapshotRepository } from '../../domain/ports';
import type { ManualRefreshResult, MeshScanResult } from '../../domain/entities';

const MANUAL_RATE_LIMIT_MS = 60 * 60 * 1000; // spec §3.2: min 1h between manual triggers

export interface MqttClient {
  subscribe(topic: string): unknown;
  on(event: 'message', cb: (topic: string, payload: Buffer) => void): unknown;
  publish(topic: string, payload: string): unknown;
}

export function createMqttMeshScanner(deps: {
  client: MqttClient;
  snapshots: SnapshotRepository;
  runtime: RuntimeStatusStore;
  baseTopic: string;
  timeoutMs: number;
}): MeshScanner {
  const requestTopic = `${deps.baseTopic}/bridge/request/networkmap`;
  const responseTopic = `${deps.baseTopic}/bridge/response/networkmap`;

  let subscribed = false;
  let inFlight: Promise<MeshScanResult> | null = null;
  let lastManualAt: number | null = null;
  let pendingResolve: ((payload: string) => void | Promise<void>) | null = null;

  function ensureSubscribed(): void {
    if (subscribed) return; // subscribe once, at init of the first request/scheduler
    subscribed = true;
    const client = deps.client;
    client.subscribe(responseTopic);
    client.on('message', (topic, payload) => {
      if (topic !== responseTopic) return;
      const resolve = pendingResolve;
      if (!resolve) return; // stale reply from an already-timed-out request - drop it
      pendingResolve = null;
      void resolve(payload.toString());
    });
  }

  function doRequest(): Promise<MeshScanResult> {
    return new Promise<MeshScanResult>((resolve) => {
      let settled = false;
      const finish = (result: MeshScanResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => {
        // Spec §3.2: on timeout log and give up - NO immediate retry;
        // the next scheduled run retries.
        pendingResolve = null;
        console.error('[networkmap] timeout waiting for bridge response');
        finish({ ok: false, error: 'timeout' });
      }, deps.timeoutMs);

      pendingResolve = async (payload) => {
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
        await deps.snapshots.insert(JSON.stringify(parsed));
        deps.runtime.markSnapshotAt(new Date());
        console.log('[networkmap] snapshot saved');
        finish({ ok: true });
      };

      const client = deps.client;
      client.publish(requestTopic, 'raw');
      console.log('[networkmap] active scan requested (rare by design, spec §2)');
    });
  }

  function request(forceManual?: boolean): Promise<MeshScanResult> {
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

  function triggerManualRefresh(): ManualRefreshResult {
    if (lastManualAt !== null && Date.now() - lastManualAt < MANUAL_RATE_LIMIT_MS) {
      return { ok: false, error: 'rate_limited' };
    }
    if (inFlight) return { ok: false, error: 'in_flight' };
    return { ok: true, promise: request(true) };
  }

  return { request, triggerManualRefresh };
}
