import { getDb } from './db';

export type EventType =
  | 'route_failure'
  | 'delivery_failure'
  | 'device_leave'
  | 'bridge_restart'
  | 'version_change'
  | 'state_change'
  | 'other';

export function insertEvent(type: EventType, device: string | null, message: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO log_events (ts, event_type, device_name, message) VALUES (?, ?, ?, ?)'
  ).run(new Date().toISOString(), type, device, message);
}

export interface ListEventsOptions {
  type?: EventType;
  sinceMs?: number;
  limit?: number;
}

export interface EventRow {
  id: number;
  ts: string;
  event_type: EventType;
  device_name: string | null;
  message: string | null;
}

export function listEvents({ type, sinceMs, limit = 200 }: ListEventsOptions = {}): EventRow[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (type) {
    clauses.push('event_type = ?');
    params.push(type);
  }
  if (sinceMs !== undefined) {
    clauses.push('ts >= ?');
    params.push(new Date(Date.now() - sinceMs).toISOString());
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return db
    .prepare(`SELECT id, ts, event_type, device_name, message FROM log_events ${where} ORDER BY ts DESC, id DESC LIMIT ?`)
    .all(...params) as EventRow[];
}
