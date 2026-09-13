'use strict';

/* ===== Mock layer (default OFF; enable with ?mock=1 for standalone preview) ===== */
const MOCK = new URLSearchParams(location.search).has('mock');
const MOCK_DEVICES = [
  { name: 'Bagno - Valvola', ieee: '0x00124b0022b1c3cc', currentLqi: 31, status: 'critical', avg24h: 38, avg7d: 120, failures24h: 7, lastSeen: new Date(Date.now() - 3111e6).toISOString() },
  { name: 'Soggiorno - Porta', ieee: '0x00124b0022b1c3bb', currentLqi: 62, status: 'warning', avg24h: 68, avg7d: 152, failures24h: 1, lastSeen: new Date(Date.now() - 42e5).toISOString() },
  { name: 'Cucina - Sensore', ieee: '0x00124b0022b1c3aa', currentLqi: 187, status: 'ok', avg24h: 190, avg7d: 193, failures24h: 0, lastSeen: new Date(Date.now() - 9e5).toISOString() },
  { name: 'Presa Corridoio', ieee: '0x00124b0022b1c3dd', currentLqi: 132, status: 'ok', avg24h: 138, avg7d: 140, failures24h: 0, lastSeen: new Date(Date.now() - 6e4).toISOString() },
];
const MOCK_MAP = {
  nodes: [
    { ieeeAddr: '0x00124b0018e1b6eb', nwkAddr: 0, type: 'Coordinator' },
    { ieeeAddr: '0x00124b0022b1c3dd', nwkAddr: 22136, type: 'Router' },
    { ieeeAddr: '0x00124b0022b1c3aa', nwkAddr: 40231, type: 'EndDevice' },
    { ieeeAddr: '0x00124b0022b1c3bb', nwkAddr: 31220, type: 'EndDevice' },
    { ieeeAddr: '0x00124b0022b1c3cc', nwkAddr: 5184, type: 'EndDevice' },
  ],
  links: [
    { sourceIeee: '0x00124b0018e1b6eb', targetIeee: '0x00124b0022b1c3dd', lqi: 132 },
    { sourceIeee: '0x00124b0018e1b6eb', targetIeee: '0x00124b0022b1c3aa', lqi: 187 },
    { sourceIeee: '0x00124b0018e1b6eb', targetIeee: '0x00124b0022b1c3bb', lqi: 62 },
    { sourceIeeeAddr: '0x00124b0022b1c3dd', targetIeeeAddr: '0x00124b0022b1c3cc', lqi: 31 },
    { sourceIeeeAddr: '0x00124b0022b1c3dd', targetIeeeAddr: '0x00124b0022b1c3aa', lqi: 105 },
  ],
};
const RANGES_MS = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6 };
const iso = (t) => new Date(t).toISOString();

function mockApi(path, opts) {
  const p = path.split('?')[0];
  const q = new URLSearchParams(path.split('?')[1] || '');
  const now = Date.now();
  if (opts && opts.method === 'POST') return Promise.resolve({ ok: true });
  if (opts && opts.method === 'PUT') {
    const m = p.match(/^\/api\/devices\/(.+)\/alias$/);
    const alias = String((opts.body ? JSON.parse(opts.body).alias : '') ?? '').trim();
    return Promise.resolve({ name: m ? decodeURIComponent(m[1]) : null, alias: alias || null });
  }
  if (p === '/api/devices') return Promise.resolve({ devices: MOCK_DEVICES });
  if (p === '/api/health')
    return Promise.resolve({
      mqttConnected: true,
      lastSampleAt: iso(now - 5000),
      lastSnapshotAt: iso(now - 75e5),
    });
  if (p.startsWith('/api/devices/') && p.endsWith('/history')) {
    const name = decodeURIComponent(p.slice('/api/devices/'.length, -'/history'.length));
    const dev = MOCK_DEVICES.find((d) => d.name === name) || MOCK_DEVICES[0];
    const ms = RANGES_MS[q.get('range')] || 864e5;
    const n = 240;
    const points = Array.from({ length: n }, (_, i) => {
      const t = now - ms + (ms * i) / (n - 1);
      const dip = i > n * 0.7 && dev.status === 'critical' ? 55 : i > n * 0.7 && dev.status === 'warning' ? 30 : 0;
      const y = Math.max(5, Math.min(254, Math.round(dev.avg24h - dip + 14 * Math.sin(i / 9) + 8 * Math.sin(i / 31))));
      return { ts: iso(t), lqi: y };
    });
    return Promise.resolve({ name, range: q.get('range'), points });
  }
  if (p === '/api/events') {
    let evs = [
      { ts: iso(now - 36e5), event_type: 'route_failure', device_name: 'Bagno - Valvola', message: 'Failed to route message to 0x00124b0022b1c3cc' },
      { ts: iso(now - 108e5), event_type: 'version_change', device_name: null, message: 'Zigbee2MQTT aggiornato: 1.42.0 -> 2.1.0' },
      { ts: iso(now - 126e5), event_type: 'delivery_failure', device_name: 'Soggiorno - Porta', message: 'Publish to device failed: timeout' },
      { ts: iso(now - 1728e5), event_type: 'bridge_restart', device_name: null, message: 'Zigbee2MQTT started' },
      { ts: iso(now - 2160e5), event_type: 'state_change', device_name: 'Soggiorno - Porta', message: 'state: OFF → ON' },
      { ts: iso(now - 2592e5), event_type: 'device_leave', device_name: 'Cucina - Sensore', message: 'Device left the network' },
    ];
    if (q.get('type')) evs = evs.filter((e) => e.event_type === q.get('type'));
    const s = RANGES_MS[q.get('since')];
    if (s) evs = evs.filter((e) => now - new Date(e.ts).getTime() <= s);
    return Promise.resolve({ events: evs });
  }
  if (p === '/api/network/latest') return Promise.resolve({ ts: iso(now - 75e5), value: MOCK_MAP });
  if (p === '/api/mesh/history') {
    const ms = RANGES_MS[q.get('range')] || 864e5;
    const base = MOCK_DEVICES.reduce((a, d) => a + d.avg24h, 0) / MOCK_DEVICES.length;
    const n = 96;
    const points = Array.from({ length: n }, (_, i) => {
      const t = now - ms + (ms * i) / (n - 1);
      return { ts: iso(t), lqi: Math.max(5, Math.min(254, Math.round(base + 10 * Math.sin(i / 7) + 6 * Math.sin(i / 23)))) };
    });
    return Promise.resolve({ range: q.get('range'), points });
  }
  return Promise.reject(new Error('mock: unknown ' + path));
}

/* ===== API ===== */
// Base-relative so calls work under a path prefix (HA ingress proxies at /api/hassio_ingress/<token>/)
const API_BASE = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]*$/, '');
async function api(path, opts) {
  if (MOCK) return mockApi(path, opts);
  const res = await fetch(API_BASE + path.replace(/^\//, ''), opts);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((body && body.error) || String(res.status));
    err.status = res.status;
    throw err;
  }
  return body;
}

/* ===== State / helpers ===== */
const el = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, p) => I18n.t(k, p);
const dotCls = (s) =>
  'inline-block w-2 h-2 rounded-full flex-none ' +
  ({ ok: 'bg-ok', warning: 'bg-warn', critical: 'bg-crit' }[s] || 'bg-muted');
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(I18n.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtDateTime = (ts) => new Date(ts).toLocaleString(I18n.locale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtFull = (ts) => new Date(ts).toLocaleString(I18n.locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// LQI_CRITICAL_ABSOLUTE / LQI_WARNING_THRESHOLD_PCT defaults (API v1 does not expose configured values)
const CRITICAL_LQI = 50;
const WARNING_PCT = 20;
const RANK = { critical: 0, warning: 1, ok: 2 };
const KNOWN_STATUS = ['ok', 'warning', 'critical'];
const statusLabel = (s) => t(`status.${KNOWN_STATUS.includes(s) ? s : 'ok'}`);
const KNOWN_EVENTS = ['route_failure', 'delivery_failure', 'device_leave', 'bridge_restart', 'version_change', 'state_change', 'other'];
const eventLabel = (e) => (KNOWN_EVENTS.includes(e) ? t(`event.${e}`) : esc(e));

const state = { devices: [], health: null, snap: null, selected: null, range: '24h' };
let chart = null;
let hmChart = null;
let historySeq = 0;

// Aliases are display-only; the canonical Z2M name still keys routes and API calls.
const dispName = (name) => {
  const d = state.devices.find((x) => x.name === name);
  return (d && d.alias) || name;
};
const currentAlias = (name) => {
  const d = state.devices.find((x) => x.name === name);
  return (d && d.alias) || '';
};
async function saveAlias(raw) {
  const name = state.selected;
  if (!name) return;
  try {
    const r = await api(`/api/devices/${encodeURIComponent(name)}/alias`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: raw.trim() }),
    });
    const d = state.devices.find((x) => x.name === name);
    if (d) d.alias = r.alias ?? null;
  } catch {
    // keep the previous name on failure; the user can retry
  }
  renderDevHeader();
  renderSidebar();
}

function route() {
  const h = location.hash || '';
  if (h.startsWith('#/device/')) return { view: 'device', name: decodeURIComponent(h.slice('#/device/'.length)) };
  if (h === '#/map') return { view: 'map' };
  if (h === '#/events') return { view: 'events' };
  return { view: 'home' };
}

/* ===== Sidebar: device list (critical -> warning -> ok) + health ===== */
function renderSidebar() {
  const list = el('devlist');
  const top = list.scrollTop;
  const devs = [...state.devices].sort(
    (a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name)
  );
  list.innerHTML = devs.length
    ? devs
        .map(
          (d) => `<a class="grid grid-cols-[14px_1fr_auto] items-center gap-1 px-[14px] py-[7px] text-ink no-underline border-l-2 border-l-transparent hover:bg-hover aria-[current=page]:bg-hover aria-[current=page]:border-l-warn" href="#/device/${encodeURIComponent(d.name)}"${state.selected === d.name ? ' aria-current="page"' : ''} aria-label="${esc(t('sidebar.deviceAria', { name: dispName(d.name), lqi: d.currentLqi, status: statusLabel(d.status) }))}">
  <span class="${dotCls(d.status)}"></span>
  <span class="text-section font-medium truncate" title="${esc(d.name)}">${esc(dispName(d.name))}</span>
  <span class="font-mono text-muted text-body">${d.currentLqi}</span>
</a>`
        )
        .join('')
    : `<p class="p-[14px] text-muted text-label">${esc(t('sidebar.empty'))}</p>`;
  list.scrollTop = top;
}

function renderHealth() {
  const dot = el('health-dot');
  const text = el('health-text');
  const sub = el('health-sample');
  if (!state.health) {
    dot.className = dotCls('muted');
    text.textContent = t('health.unreachable');
    sub.hidden = true;
    return;
  }
  dot.className = dotCls(state.health.mqttConnected ? 'ok' : 'critical');
  text.textContent = state.health.mqttConnected ? t('health.mqttConnected') : t('health.mqttDisconnected');
  sub.hidden = false;
  sub.textContent = state.health.lastSampleAt
    ? t('health.lastSample', { time: fmtTime(state.health.lastSampleAt) })
    : t('health.noSample');
}

/* ===== Device detail ===== */
function renderDevHeader() {
  const d = state.devices.find((x) => x.name === state.selected);
  const alias = currentAlias(state.selected);
  el('dev-name').textContent = state.selected ? dispName(state.selected) : '—';
  el('dev-rename-btn').hidden = !state.selected;
  el('dev-rename-form').hidden = true;
  el('dev-rename-input').placeholder = state.selected || t('device.renamePlaceholder');
  el('dev-data').innerHTML = d
    ? `<span><span class="text-label">${t('device.currentLqi')} </span><span class="font-mono text-ink">${d.currentLqi}</span></span>
<span><span class="text-label">${t('device.status')} </span><span class="${dotCls(d.status)}"></span> ${statusLabel(d.status)}</span>
<span><span class="text-label">${t('device.avg24h')} </span><span class="font-mono text-ink">${d.avg24h != null ? Math.round(d.avg24h) : '—'}</span></span>
<span><span class="text-label">${t('device.avg7d')} </span><span class="font-mono text-ink">${d.avg7d != null ? Math.round(d.avg7d) : '—'}</span></span>
<span><span class="text-label">${t('device.failures24h')} </span><span class="font-mono text-ink">${d.failures24h}</span></span>
<span><span class="text-label">${t('device.lastSeen')} </span><span class="font-mono text-ink">${d.lastSeen ? fmtFull(d.lastSeen) : '—'}</span></span>
<span><span class="text-label">IEEE </span><span class="font-mono text-ink">${d.ieee ? esc(d.ieee) : '—'}</span></span>${alias ? `
<span><span class="text-label">${t('device.z2mName')} </span><span class="font-mono text-ink">${esc(d.name)}</span></span>` : ''}`
    : `<span>${t('device.notInData')}</span>`;
}

function renderDeviceDetail(name) {
  state.selected = name;
  renderDevHeader();
  renderSidebar();
  void loadHistory();
  void loadDeviceEvents(name);
}

function warnLine() {
  const d = state.devices.find((x) => x.name === state.selected);
  return d && d.avg7d ? d.avg7d * (1 - WARNING_PCT / 100) : null;
}

function statusColorLqi(lqi, warn) {
  if (lqi < CRITICAL_LQI) return '#C1533E';
  if (warn != null && lqi < warn) return '#D9A441';
  return '#4FB477';
}

function showChartEmpty(msg) {
  el('chart-empty').textContent = msg;
  el('chart-empty').hidden = false;
  el('chart-wrap').classList.add('hidden');
}

// Light colored band under warning/critical thresholds (spec §8.4)
const thresholdBands = {
  id: 'thresholdBands',
  beforeDatasetsDraw(c, _args, o) {
    if (!o) return;
    const { ctx, chartArea: a, scales: { y } } = c;
    ctx.save();
    ctx.setLineDash([4, 4]);
    if (o.critical != null) {
      const yc = Math.min(Math.max(y.getPixelForValue(o.critical), a.top), a.bottom);
      ctx.fillStyle = 'rgba(193,83,62,0.10)';
      ctx.fillRect(a.left, yc, a.right - a.left, a.bottom - yc);
      ctx.strokeStyle = 'rgba(193,83,62,0.75)';
      ctx.beginPath();
      ctx.moveTo(a.left, yc);
      ctx.lineTo(a.right, yc);
      ctx.stroke();
    }
    if (o.warning != null) {
      const yw = y.getPixelForValue(o.warning);
      const yBottom = o.critical != null ? y.getPixelForValue(o.critical) : a.bottom;
      if (yw >= a.top && yw < yBottom) {
        ctx.fillStyle = 'rgba(217,164,65,0.08)';
        ctx.fillRect(a.left, yw, a.right - a.left, yBottom - yw);
        ctx.strokeStyle = 'rgba(217,164,65,0.7)';
        ctx.beginPath();
        ctx.moveTo(a.left, yw);
        ctx.lineTo(a.right, yw);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

function fmtTick(v, range) {
  const d = new Date(v);
  const rg = range || state.range;
  return rg === '24h'
    ? d.toLocaleTimeString(I18n.locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(I18n.locale, { day: '2-digit', month: '2-digit' });
}

function applyChartDefaults() {
  Chart.defaults.color = '#8B939B';
  Chart.defaults.font.family = "'IBM Plex Mono', Menlo, Consolas, monospace";
  Chart.defaults.font.size = 10.5;
}

function createChart() {
  if (typeof Chart === 'undefined') {
    showChartEmpty(t('common.chartNotLoaded'));
    return null;
  }
  applyChartDefaults();
  return new Chart(el('chart').getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          data: [],
          borderWidth: 1.5,
          fill: false,
          pointRadius: () => (state.range === '24h' ? 1.6 : 0),
          pointHoverRadius: 3,
          pointBackgroundColor: (c) => (c.parsed ? statusColorLqi(c.parsed.y, warnLine()) : '#4FB477'),
          segment: { borderColor: (s) => statusColorLqi((s.p0.parsed.y + s.p1.parsed.y) / 2, warnLine()) },
        },
      ],
    },
    options: {
      animation: { duration: 250 },
      parsing: false,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
        tooltip: {
          callbacks: {
            title: (items) => fmtDateTime(items[0].parsed.x),
            label: (item) => 'LQI ' + item.parsed.y,
          },
        },
        thresholdBands: { critical: CRITICAL_LQI, warning: warnLine() },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: { maxTicksLimit: 7, callback: (v) => fmtTick(v) },
          grid: { color: 'rgba(42,47,53,0.55)' },
        },
        y: {
          min: 0,
          max: 255,
          title: { display: true, text: 'LQI', color: '#8B939B' },
          grid: { color: 'rgba(42,47,53,0.55)' },
        },
      },
    },
    plugins: [thresholdBands],
  });
}

async function loadHistory() {
  const name = state.selected;
  const range = state.range;
  const seq = ++historySeq;
  if (!name) return;
  let data;
  try {
    data = await api(`/api/devices/${encodeURIComponent(name)}/history?range=${range}`);
  } catch (e) {
    if (seq === historySeq) showChartEmpty(t('device.notFound'));
    return;
  }
  if (seq !== historySeq) return;
  const pts = (data.points || []).map((p) => ({ x: +new Date(p.ts), y: p.lqi }));
  if (!pts.length) {
    showChartEmpty(t('device.noSamples'));
    return;
  }
  el('chart-empty').hidden = true;
  el('chart-wrap').classList.remove('hidden');
  if (!chart) chart = createChart();
  if (!chart) return;
  const now = Date.now();
  chart.options.scales.x.min = now - RANGES_MS[range];
  chart.options.scales.x.max = now;
  chart.options.plugins.thresholdBands = { critical: CRITICAL_LQI, warning: warnLine() };
  chart.data.datasets[0].data = pts;
  el('chart').setAttribute('aria-label', t('device.historyAria', { name: dispName(name), range }));
  chart.update();
}

/* ===== Events ===== */
function eventRow(e) {
  const base =
    'grid grid-cols-[132px_148px_minmax(110px,0.35fr)_1fr] gap-2.5 px-3 py-[7px] border-b border-line bg-panel min-w-0 last:border-b-0 max-[720px]:grid-cols-[108px_1fr] max-[720px]:grid-rows-[auto_auto]';
  return `<li class="${base}${e.event_type === 'version_change' ? ' border-l-2 border-l-warn bg-version' : ''}">
  <span class="font-mono text-muted text-label">${fmtDateTime(e.ts)}</span>
  <span class="text-ink text-label">${eventLabel(e.event_type)}</span>
  <span class="text-muted text-label truncate">${e.device_name ? esc(dispName(e.device_name)) : '—'}</span>
  <span class="text-ink text-label [overflow-wrap:anywhere]">${e.message ? esc(e.message) : ''}</span>
</li>`;
}

async function loadDeviceEvents(name) {
  const ul = el('dev-events');
  ul.innerHTML = '';
  try {
    const d = await api('/api/events?since=30d&limit=500');
    const rows = (d.events || []).filter((e) => e.device_name === name).slice(0, 30);
    ul.innerHTML = rows.length
      ? rows.map(eventRow).join('')
      : `<li class="grid grid-cols-1 text-muted px-3 py-[7px] border-b border-line bg-panel">${t('device.noEvents')}</li>`;
  } catch {
    ul.innerHTML = `<li class="grid grid-cols-1 text-muted px-3 py-[7px] border-b border-line bg-panel">${t('common.eventsUnavailable')}</li>`;
  }
}

async function loadEvents() {
  const type = el('ev-type').value;
  const since = el('ev-since').value;
  const q = new URLSearchParams();
  if (type) q.set('type', type);
  if (since) q.set('since', since);
  const ul = el('ev-list');
  const empty = el('ev-empty');
  ul.innerHTML = '';
  try {
    const d = await api('/api/events?' + q.toString());
    const rows = d.events || [];
    empty.textContent = t('events.empty');
    empty.hidden = rows.length > 0;
    ul.innerHTML = rows.map(eventRow).join('');
  } catch {
    empty.textContent = t('common.eventsUnavailable');
    empty.hidden = false;
  }
}

/* ===== Network map: client-rendered SVG, radial around coordinator ===== */
function lqiBucket(lqi) {
  const v = Number(lqi) || 0;
  if (v >= 120) return { col: '#4FB477', id: 'arrow-ok' };
  if (v >= 60) return { col: '#D9A441', id: 'arrow-warn' };
  return { col: '#C1533E', id: 'arrow-crit' };
}

function nodeRadius(n, isCoord) {
  const t = String((n && n.type) || '');
  if (isCoord || /coordinator/i.test(t)) return 9;
  if (/router/i.test(t)) return 6;
  return 5;
}

function trimEnd(s, t, tRadius) {
  const dx = t.x - s.x, dy = t.y - s.y;
  const d = Math.hypot(dx, dy) || 1;
  const r = (Number(tRadius) || 0) + 2;
  return { x: t.x - (dx / d) * r, y: t.y - (dy / d) * r };
}

function linkEnd(l, side) {
  const a = side === 'source' ? 'sourceIeee' : 'targetIeee';
  const b = side === 'source' ? 'sourceIeeeAddr' : 'targetIeeeAddr';
  const c = side === 'source' ? 'source' : 'target';
  return String(l[a] ?? l[b] ?? l[c] ?? '').toLowerCase();
}

function buildMapSvg(value) {
  if (!value || !Array.isArray(value.nodes) || !value.nodes.length) return '';
  const nodes = value.nodes;
  const links = value.links || [];
  const key = (n) => String(n.ieeeAddr ?? n.nwkAddr ?? '').toLowerCase();
  const isType = (n, re) => re.test(String(n.type || ''));
  const coord = nodes.find((n) => isType(n, /coordinator/i)) || null;
  const others = nodes.filter((n) => n !== coord).sort((a, b) => key(a).localeCompare(key(b)));
  const routers = others.filter((n) => isType(n, /router/i));
  const ends = others.filter((n) => !routers.includes(n));

  const r1 = Math.max(170, 9 * routers.length);
  const r2 = Math.max(r1 + 120, r1 + 9 * ends.length);
  const W = Math.max(760, 2 * r2 + 180);
  const H = 2 * r2 + 130;
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map();
  if (coord) pos.set(key(coord), { x: cx, y: cy });
  for (const [ring, r] of [
    [routers, r1],
    [ends, r2],
  ]) {
    ring.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(ring.length, 1) - Math.PI / 2;
      pos.set(key(n), { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    });
  }

  const nodeByKey = new Map(nodes.map((n) => [key(n), n]));
  let edges = '';
  for (const l of links) {
    const sk = linkEnd(l, 'source');
    const tk = linkEnd(l, 'target');
    const s = pos.get(sk);
    const t = pos.get(tk);
    if (!s || !t) continue;
    const b = lqiBucket(l.lqi);
    const lqi = Number(l.lqi) || 0;
    const w = (0.8 + 3.2 * (lqi / 255)).toFixed(2);
    const end = trimEnd(s, t, nodeRadius(nodeByKey.get(tk)));
    edges += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${b.col}" stroke-width="${w}" opacity="0.85" marker-end="url(#${b.id})"><title>LQI ${lqi}</title></line>`;
  }
  const defs = edges
    ? `<defs>
<marker id="arrow-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4FB477"/></marker>
<marker id="arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#D9A441"/></marker>
<marker id="arrow-crit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#C1533E"/></marker>
</defs>`
    : '';

  const nameByIeee = new Map(
    state.devices.filter((d) => d.ieee).map((d) => [d.ieee.toLowerCase(), d.name])
  );
  const shortAddr = (n) =>
    n.nwkAddr != null && n.nwkAddr !== ''
      ? '0x' + Number(n.nwkAddr).toString(16).padStart(4, '0')
      : key(n).slice(-8);
  let nodeSvg = '';
  for (const n of nodes) {
    const p = pos.get(key(n));
    if (!p) continue;
    const isC = n === coord;
    const isR = !isC && isType(n, /router/i);
    const fill = isC ? '#E4E7EA' : isR ? '#9AA4AC' : '#6A7480';
    const r = nodeRadius(n, isC);
    const named = nameByIeee.get(key(n));
    const label = isC ? t('map.coordinator') : named ? dispName(named) : shortAddr(n);
    const mono = !isC && !named;
    nodeSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}"><title>${esc(label)}${n.type ? ' · ' + esc(n.type) : ''}</title></circle>
<text x="${p.x.toFixed(1)}" y="${(p.y + r + 14).toFixed(1)}" text-anchor="middle" fill="${mono ? '#8B939B' : '#E4E7EA'}" font-size="${mono ? 9.5 : 10.5}" font-family="${mono ? "'IBM Plex Mono', Menlo, monospace" : "'IBM Plex Sans', sans-serif"}">${esc(label)}</text>`;
  }

  return `<svg class="block w-full h-auto" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t('map.ariaLabel')}">${defs}${edges}${nodeSvg}</svg>`;
}

async function loadMap() {
  const box = el('map-svg');
  const emptyEl = el('map-empty');
  box.innerHTML = '';
  emptyEl.hidden = true;
  el('map-ts').textContent = '—';
  let snap;
  try {
    snap = await api('/api/network/latest');
  } catch {
    emptyEl.hidden = false;
    return;
  }
  el('map-ts').textContent = fmtFull(snap.ts);
  box.innerHTML = buildMapSvg(snap.value);
  if (!box.innerHTML) emptyEl.hidden = false;
}

async function refreshMap() {
  const btn = el('map-refresh');
  const msg = el('map-msg');
  btn.disabled = true;
  msg.hidden = false;
  msg.textContent = t('map.scanning');
  try {
    await api('/api/network/refresh', { method: 'POST' });
    msg.textContent = t('map.updated');
    await loadMap();
  } catch (e) {
    if (e.status === 429) msg.textContent = t('map.rateLimited');
    else if (e.status === 409) msg.textContent = t('map.inFlight');
    else msg.textContent = t('map.failed', { error: e.message || 'errore' });
  } finally {
    btn.disabled = false;
  }
}

/* ===== Overview (home): recap of devices, watchlist, stale, mesh trend, events ===== */
function renderHomeStats() {
  const ds = state.devices;
  const n = (s) => ds.filter((d) => d.status === s).length;
  const avgLqi = ds.length ? Math.round(ds.reduce((a, d) => a + d.currentLqi, 0) / ds.length) : null;
  const fails = ds.reduce((a, d) => a + (d.failures24h || 0), 0);
  el('hm-stats').innerHTML = `
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px]">${ds.length}</span><span class="text-label text-muted">${t('home.statDevices')}</span></div>
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px] text-ok">${n('ok')}</span><span class="text-label text-muted">${t('home.statOk')}</span></div>
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px] text-warn">${n('warning')}</span><span class="text-label text-muted">${t('home.statWarning')}</span></div>
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px] text-crit">${n('critical')}</span><span class="text-label text-muted">${t('home.statCritical')}</span></div>
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px]" style="color:${statusColorLqi(avgLqi ?? 0, null)}">${avgLqi != null ? avgLqi : '—'}</span><span class="text-label text-muted">${t('home.statAvg')}</span></div>
    <div class="bg-panel border border-line px-[14px] py-2.5 flex flex-col gap-0.5"><span class="font-mono text-[22px]${fails > 0 ? ' text-crit' : ''}">${fails}</span><span class="text-label text-muted">${t('home.statFailures')}</span></div>`;
  el('home-empty').hidden = ds.length > 0;
}

function renderHomeWatch() {
  const bad = state.devices
    .filter((d) => d.status !== 'ok')
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  el('hm-watch').innerHTML = bad
    .map(
      (d) => `<li><a class="flex items-center flex-wrap gap-x-2.5 gap-y-1.5 px-3 py-[7px] border-b border-line bg-panel text-ink no-underline min-w-0 last:border-b-0 hover:bg-hover" href="#/device/${encodeURIComponent(d.name)}">
  <span class="${dotCls(d.status)}"></span>
  <span class="font-medium truncate">${esc(dispName(d.name))}</span>
  <span class="font-mono text-muted text-label">${t('home.watchLine', { lqi: d.currentLqi, avg24h: d.avg24h != null ? Math.round(d.avg24h) : '—', avg7d: d.avg7d != null ? Math.round(d.avg7d) : '—', failures: d.failures24h })}</span>
</a></li>`
    )
    .join('');
  el('hm-watch-empty').hidden = bad.length > 0;
}

// Stale = no message in 24h. Sleepy battery sensors legitimately span hours,
// so 24h is the ceiling; tighten if your devices report more often.
const STALE_MS = 864e5;
function renderHomeStale() {
  const cut = Date.now() - STALE_MS;
  const stale = state.devices
    .filter((d) => !d.lastSeen || +new Date(d.lastSeen) < cut)
    .sort((a, b) => String(a.lastSeen).localeCompare(String(b.lastSeen)));
  el('hm-stale').innerHTML = stale
    .map(
      (d) => `<li><a class="flex items-center flex-wrap gap-x-2.5 gap-y-1.5 px-3 py-[7px] border-b border-line bg-panel text-ink no-underline min-w-0 last:border-b-0 hover:bg-hover" href="#/device/${encodeURIComponent(d.name)}">
  <span class="${dotCls('muted')}"></span>
  <span class="font-medium truncate">${esc(dispName(d.name))}</span>
  <span class="font-mono text-muted text-label">${t('home.staleLastSeen', { time: d.lastSeen ? fmtFull(d.lastSeen) : t('home.never') })}</span>
</a></li>`
    )
    .join('');
  el('hm-stale-empty').hidden = stale.length > 0;
}

async function loadHomeEvents() {
  try {
    // ponytail: type counts derived from this 500-row fetch — exact tallies need a dedicated endpoint
    const d = await api('/api/events?since=24h&limit=500');
    const rows = d.events || [];
    el('hm-events').innerHTML = rows.slice(0, 8).map(eventRow).join('');
    el('hm-ev-empty').hidden = rows.length > 0;
    const counts = {};
    for (const e of rows) counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    el('hm-chips').innerHTML = Object.keys(counts).length
      ? Object.entries(counts)
          .map(([t, c]) => `<span class="inline-flex items-center gap-[7px] border border-line bg-panel px-2.5 py-1 text-label text-muted"><span class="font-mono text-ink">${c}</span>${eventLabel(t)}</span>`)
          .join('')
      : `<span class="inline-flex items-center gap-[7px] border border-line bg-panel px-2.5 py-1 text-label text-muted"><span class="font-mono text-ink">0</span>${esc(t('home.eventsChip'))}</span>`;
  } catch {
    el('hm-ev-empty').hidden = false;
    el('hm-chips').innerHTML = '';
  }
}

function renderHomeNet() {
  const box = el('hm-net');
  if (!state.snap || !state.snap.value) {
    box.textContent = t('home.noSnapshot');
    return;
  }
  const v = state.snap.value;
  const nodes = Array.isArray(v.nodes) ? v.nodes : [];
  const links = Array.isArray(v.links) ? v.links : [];
  const isType = (x, re) => re.test(String(x.type || ''));
  const routers = nodes.filter((x) => isType(x, /router/i)).length;
  const coord = nodes.filter((x) => isType(x, /coordinator/i)).length;
  const ends = nodes.length - routers - coord;
  const nameByIeee = new Map(
    state.devices.filter((d) => d.ieee).map((d) => [d.ieee.toLowerCase(), d.name])
  );
  const nm = (ieee) => {
    const k = String(ieee ?? '').toLowerCase();
    const n0 = nameByIeee.get(k);
    return n0 ? dispName(n0) : String(ieee ?? '?').slice(-8);
  };
  const weakest = [...links]
    .sort((a, b) => (Number(a.lqi) || 0) - (Number(b.lqi) || 0))
    .slice(0, 3);
  box.innerHTML =
    t('home.netSummary', { nodes: nodes.length, routers, ends }) +
    (weakest.length
      ? '<br>' + t('home.weakestLinks') + '<br>' +
        weakest
          .map((l) => `<span class="font-mono text-ink">${esc(nm(linkEnd(l, 'source')))} → ${esc(nm(linkEnd(l, 'target')))} · LQI ${Number(l.lqi) || 0}</span>`)
          .join('<br>')
      : '');
}

async function loadHomeSnapshot() {
  try {
    state.snap = await api('/api/network/latest');
    el('hm-snap').innerHTML = `${t('home.snapshot', { time: `<span class="font-mono text-ink">${esc(fmtFull(state.snap.ts))}</span>` })} — <a href="#/map" class="text-ink">${esc(t('common.view'))}</a>`;
  } catch {
    state.snap = null;
    el('hm-snap').textContent = t('home.noMap');
  }
  renderHomeNet();
}

async function loadHomeTrend() {
  const wrap = el('hm-chart-wrap');
  const empty = el('hm-chart-empty');
  let data;
  try {
    data = await api('/api/mesh/history?range=24h');
  } catch {
    empty.hidden = false;
    wrap.classList.add('hidden');
    return;
  }
  const pts = (data.points || []).map((p) => ({ x: +new Date(p.ts), y: p.lqi }));
  if (!pts.length) {
    empty.hidden = false;
    wrap.classList.add('hidden');
    return;
  }
  if (typeof Chart === 'undefined') {
    empty.textContent = t('common.chartNotLoaded');
    empty.hidden = false;
    wrap.classList.add('hidden');
    return;
  }
  empty.hidden = true;
  wrap.classList.remove('hidden');
  if (!hmChart) {
    applyChartDefaults();
    hmChart = new Chart(el('hm-chart').getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          {
            data: [],
            borderWidth: 1.5,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 3,
            segment: { borderColor: (s) => statusColorLqi((s.p0.parsed.y + s.p1.parsed.y) / 2, null) },
          },
        ],
      },
      options: {
        animation: { duration: 250 },
        parsing: false,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => fmtDateTime(items[0].parsed.x),
              label: (item) => t('home.meshAvgTooltip', { value: item.parsed.y }),
            },
          },
        },
        scales: {
          x: { type: 'linear', ticks: { maxTicksLimit: 7, callback: (v) => fmtTick(v, '24h') }, grid: { color: 'rgba(42,47,53,0.55)' } },
          y: { min: 0, max: 255, title: { display: true, text: 'LQI', color: '#8B939B' }, grid: { color: 'rgba(42,47,53,0.55)' } },
        },
      },
    });
  }
  const now = Date.now();
  hmChart.options.scales.x.min = now - RANGES_MS['24h'];
  hmChart.options.scales.x.max = now;
  hmChart.data.datasets[0].data = pts;
  hmChart.update();
}

function refreshHome() {
  renderHomeStats();
  renderHomeWatch();
  renderHomeStale();
  void loadHomeEvents();
  void loadHomeTrend();
}

/* ===== Router ===== */
const VIEWS = { home: 'view-home', device: 'view-device', map: 'view-map', events: 'view-events' };

function onRoute() {
  const r = route();
  for (const id of Object.values(VIEWS)) el(id).hidden = true;
  el(VIEWS[r.view]).hidden = false;
  if (r.view === 'map') el('nav-map').setAttribute('aria-current', 'page');
  else el('nav-map').removeAttribute('aria-current');
  if (r.view === 'events') el('nav-events').setAttribute('aria-current', 'page');
  else el('nav-events').removeAttribute('aria-current');
  if (r.view === 'device') {
    renderDeviceDetail(r.name);
  } else if (r.view === 'map') {
    state.selected = null;
    renderSidebar();
    void loadMap();
  } else if (r.view === 'events') {
    state.selected = null;
    renderSidebar();
    void loadEvents();
  } else {
    state.selected = null;
    renderSidebar();
    refreshHome();
    void loadHomeSnapshot();
  }
}

/* ===== Polling: devices + health every ~15s; chart re-renders with <=300ms transition ===== */
async function poll() {
  try {
    const [d, h] = await Promise.all([api('/api/devices'), api('/api/health')]);
    state.devices = d.devices || [];
    state.health = h;
  } catch {
    state.health = null;
  }
  renderHealth();
  renderSidebar();
  if (route().view === 'home') {
    refreshHome();
  } else if (route().view === 'device') {
    renderDevHeader();
    void loadHistory();
  }
}

/* ===== Sidebar resize ===== */
const SIDEBAR_KEY = 'sidebar-w';
const SIDEBAR_MIN = 180;
const sidebarMax = () => Math.max(SIDEBAR_MIN, Math.min(560, window.innerWidth - 320));
function setSidebarWidth(w, save) {
  const clamped = Math.max(SIDEBAR_MIN, Math.min(sidebarMax(), Math.round(w)));
  document.documentElement.style.setProperty('--sidebar-w', clamped + 'px');
  if (save) localStorage.setItem(SIDEBAR_KEY, String(clamped));
  return clamped;
}
function setupSidebarResize() {
  const handle = el('sidebar-resize');
  const saved = Number(localStorage.getItem(SIDEBAR_KEY));
  if (saved) setSidebarWidth(saved, false);
  let dragging = false;
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    const w = document.documentElement.style.getPropertyValue('--sidebar-w');
    if (w) localStorage.setItem(SIDEBAR_KEY, w.replace('px', ''));
  };
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (dragging) setSidebarWidth(e.clientX, false);
  });
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = parseInt(document.documentElement.style.getPropertyValue('--sidebar-w'), 10) || 272;
    setSidebarWidth(cur + (e.key === 'ArrowRight' ? 16 : -16), true);
  });
}

function syncLangButtons() {
  const active = I18n.getLang();
  document.querySelectorAll('#lang-switcher button[data-lang]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.lang === active ? 'true' : 'false');
  });
}

function init() {
  el('rangebar').querySelector('button[data-range="24h"]').setAttribute('aria-pressed', 'true');
  el('rangebar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    state.range = b.dataset.range;
    el('rangebar').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    void loadHistory();
  });
  el('ev-filters').addEventListener('submit', (e) => e.preventDefault());
  el('ev-filters').addEventListener('change', () => {
    if (route().view === 'events') void loadEvents();
  });
  el('map-refresh').addEventListener('click', () => void refreshMap());
  el('dev-rename-btn').addEventListener('click', () => {
    if (!state.selected) return;
    el('dev-rename-input').value = currentAlias(state.selected);
    el('dev-rename-form').hidden = false;
    el('dev-rename-input').focus();
  });
  el('dev-rename-cancel').addEventListener('click', () => {
    el('dev-rename-form').hidden = true;
  });
  el('dev-rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void saveAlias(el('dev-rename-input').value);
  });
  setupSidebarResize();
  window.addEventListener('hashchange', onRoute);
  el('lang-switcher').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lang]');
    if (b) void I18n.setLang(b.dataset.lang);
  });
  syncLangButtons();
  I18n.onChange(() => {
    syncLangButtons();
    onRoute();
  });
  onRoute();
  void poll();
  setInterval(() => void poll(), 15000);
}

I18n.ready.then(init);
