import express, { type NextFunction, type Request, type Response } from 'express';
import * as path from 'path';
import { config } from '../config';
import { runtimeStatus } from '../runtime';
import { computeDeviceSummaries } from '../analysis/status';
import { history, listDeviceNames, meshHistory } from '../db/repositories/samples';
import { getAllAliases, setAlias } from '../db/repositories/aliases';
import { listEvents, type EventType } from '../db/repositories/events';
import { getLatestSnapshot } from '../db/repositories/snapshots';
import { triggerManualRefresh } from '../networkmap';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const RANGES: Record<string, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
const EVENT_TYPES: EventType[] = [
  'route_failure',
  'delivery_failure',
  'device_leave',
  'bridge_restart',
  'version_change',
  'state_change',
  'other',
];

function parseSince(v: string | undefined): number | undefined {
  if (!v) return undefined;
  if (v === '24h') return DAY;
  if (v === '7d') return 7 * DAY;
  if (v === '30d') return 30 * DAY;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Date.now() - t;
}

function queryStr(req: Request, name: string): string | undefined {
  const v = req.query[name];
  return typeof v === 'string' ? v : undefined;
}

export function startApi(): void {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  if (config.apiKey) {
    app.use('/api', (req: Request, res: Response, next) => {
      const auth = req.get('authorization');
      if (auth === `Bearer ${config.apiKey}` || req.get('x-api-key') === config.apiKey) {
        next();
      } else {
        res.status(401).json({ error: 'unauthorized' });
      }
    });
  }

  app.get('/api/devices', async (_req, res) => {
    const [devices, aliases] = await Promise.all([computeDeviceSummaries(), getAllAliases()]);
    res.json({ devices: devices.map((d) => ({ ...d, alias: aliases.get(d.name) ?? null })) });
  });

  app.put('/api/devices/:name/alias', async (req, res) => {
    const name = req.params.name;
    if (!(await listDeviceNames()).includes(name)) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const raw = (req.body as { alias?: unknown } | undefined)?.alias;
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      res.status(400).json({ error: 'invalid alias' });
      return;
    }
    const alias = typeof raw === 'string' ? raw.trim() : '';
    if (alias.length > 60) {
      res.status(400).json({ error: 'alias too long' });
      return;
    }
    await setAlias(name, alias || null);
    res.json({ name, alias: alias || null });
  });

  app.get('/api/devices/:name/history', async (req, res) => {
    const ms = RANGES[queryStr(req, 'range') ?? ''];
    if (!ms) {
      res.status(400).json({ error: 'invalid range' });
      return;
    }
    const name = req.params.name;
    if (!(await listDeviceNames()).includes(name)) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const points = (await history(name, ms)).map((r) => ({ ts: r.ts, lqi: r.lqi }));
    res.json({ name, range: queryStr(req, 'range'), points });
  });

  app.get('/api/mesh/history', async (req, res) => {
    const ms = RANGES[queryStr(req, 'range') ?? ''];
    if (!ms) {
      res.status(400).json({ error: 'invalid range' });
      return;
    }
    res.json({ range: queryStr(req, 'range'), points: await meshHistory(ms) });
  });

  app.get('/api/events', async (req, res) => {
    const type = queryStr(req, 'type');
    const validatedType = type && (EVENT_TYPES as string[]).includes(type) ? (type as EventType) : undefined;
    const limitRaw = parseInt(queryStr(req, 'limit') ?? '', 10);
    const limit = Math.min(Number.isNaN(limitRaw) ? 200 : Math.max(limitRaw, 1), 500);
    res.json({
      events: await listEvents({ type: validatedType, sinceMs: parseSince(queryStr(req, 'since')), limit }),
    });
  });

  app.get('/api/network/latest', async (_req, res) => {
    const row = await getLatestSnapshot();
    if (!row) {
      res.status(404).json({ error: 'no snapshot' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.raw_json);
    } catch {
      res.status(404).json({ error: 'no snapshot' });
      return;
    }
    // Raw Z2M response: { status, data: { type: 'raw', value: { nodes, links } } }
    const obj = parsed as { data?: { value?: unknown }; value?: unknown };
    res.json({ ts: row.ts, value: obj?.data?.value ?? obj?.value ?? null });
  });

  app.post('/api/network/refresh', (req, res) => {
    const gate = triggerManualRefresh();
    if (!gate.ok) {
      if (gate.error === 'rate_limited') res.status(429).json({ error: 'rate_limited' });
      else if (gate.error === 'in_flight') res.status(409).json({ error: 'in_flight' });
      else res.status(503).json({ error: gate.error ?? 'unavailable' });
      return;
    }
    // Await the scan (up to networkmapTimeoutMs) and report the final result.
    gate.promise!.then(
      (r) => {
        if (!res.headersSent) res.status(r.ok ? 200 : 502).json(r);
      },
      () => {
        if (!res.headersSent) res.status(502).json({ ok: false, error: 'internal' });
      }
    );
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      mqttConnected: runtimeStatus.mqttConnected,
      lastSampleAt: runtimeStatus.lastSampleAt?.toISOString() ?? null,
      lastSnapshotAt: runtimeStatus.lastSnapshotAt?.toISOString() ?? null,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Static frontend (task 06); missing public/ is tolerated — API stays up.
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));
  app.get('/', (_req, res) => {
    res.status(404).json({ error: 'no frontend yet' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  });

  app.listen(config.httpPort, () => {
    console.log(`[api] listening on :${config.httpPort}`);
  });
}
