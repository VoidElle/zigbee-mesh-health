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
    { sourceIeee: '0x00124b0022b1c3dd', targetIeee: '0x00124b0022b1c3cc', lqi: 31 },
    { sourceIeee: '0x00124b0022b1c3dd', targetIeee: '0x00124b0022b1c3aa', lqi: 105 },
  ],
};
const RANGES_MS = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6 };
const iso = (t) => new Date(t).toISOString();

function mockApi(path, opts) {
  const p = path.split('?')[0];
  const q = new URLSearchParams(path.split('?')[1] || '');
  const now = Date.now();
  if (opts && opts.method === 'POST') return Promise.resolve({ ok: true });
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
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtDateTime = (ts) => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtFull = (ts) => new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// LQI_CRITICAL_ABSOLUTE / LQI_WARNING_THRESHOLD_PCT defaults (API v1 does not expose configured values)
const CRITICAL_LQI = 50;
const WARNING_PCT = 20;
const RANK = { critical: 0, warning: 1, ok: 2 };
const STATUS_IT = { ok: 'ok', warning: 'attenzione', critical: 'critico' };
const EVENT_IT = {
  route_failure: 'Guasto route',
  delivery_failure: 'Consegna fallita',
  device_leave: 'Uscita dispositivo',
  bridge_restart: 'Restart bridge',
  version_change: 'Cambio versione',
  state_change: 'Cambio stato',
  other: 'Altro',
};

const state = { devices: [], health: null, snap: null, selected: null, range: '24h' };
let chart = null;
let hmChart = null;
let historySeq = 0;

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
          (d) => `<a class="dev${state.selected === d.name ? ' active' : ''}" href="#/device/${encodeURIComponent(d.name)}"${state.selected === d.name ? ' aria-current="page"' : ''} aria-label="${esc(d.name)}, LQI ${d.currentLqi}, ${STATUS_IT[d.status]}">
  <span class="dot dot-${d.status}"></span>
  <span class="dev-name" title="${esc(d.name)}">${esc(d.name)}</span>
  <span class="dev-lqi">${d.currentLqi}</span>
</a>`
        )
        .join('')
    : '<p class="devlist-empty">Nessun dispositivo. In attesa di dati da Zigbee2MQTT…</p>';
  list.scrollTop = top;
}

function renderHealth() {
  const dot = el('health-dot');
  const text = el('health-text');
  const sub = el('health-sample');
  if (!state.health) {
    dot.className = 'dot dot-muted';
    text.textContent = 'Servizio non raggiungibile';
    sub.hidden = true;
    return;
  }
  dot.className = 'dot ' + (state.health.mqttConnected ? 'dot-ok' : 'dot-critical');
  text.textContent = state.health.mqttConnected ? 'MQTT collegato' : 'MQTT non collegato';
  sub.hidden = false;
  sub.textContent = state.health.lastSampleAt
    ? 'Ultimo campione: ' + fmtTime(state.health.lastSampleAt)
    : 'Nessun campione ricevuto';
}

/* ===== Device detail ===== */
function renderDevHeader() {
  const d = state.devices.find((x) => x.name === state.selected);
  el('dev-name').textContent = state.selected || '—';
  el('dev-data').innerHTML = d
    ? `<span><span class="lab">LQI attuale </span><span class="val">${d.currentLqi}</span></span>
<span><span class="lab">stato </span><span class="dot dot-${d.status}"></span> ${STATUS_IT[d.status]}</span>
<span><span class="lab">media 24h </span><span class="val">${d.avg24h != null ? Math.round(d.avg24h) : '—'}</span></span>
<span><span class="lab">media 7g </span><span class="val">${d.avg7d != null ? Math.round(d.avg7d) : '—'}</span></span>
<span><span class="lab">guasti 24h </span><span class="val">${d.failures24h}</span></span>
<span><span class="lab">ultimo msg </span><span class="val">${d.lastSeen ? fmtFull(d.lastSeen) : '—'}</span></span>
<span><span class="lab">IEEE </span><span class="val">${d.ieee ? esc(d.ieee) : '—'}</span></span>`
    : '<span>Dispositivo non presente nei dati attuali</span>';
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
  document.querySelector('.chartwrap').classList.add('has-empty');
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
    ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function applyChartDefaults() {
  Chart.defaults.color = '#8B939B';
  Chart.defaults.font.family = "'IBM Plex Mono', Menlo, Consolas, monospace";
  Chart.defaults.font.size = 10.5;
}

function createChart() {
  if (typeof Chart === 'undefined') {
    showChartEmpty('Chart.js non caricato (CDN non raggiungibile o offline)');
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
    if (seq === historySeq) showChartEmpty('Dispositivo non trovato nella rete.');
    return;
  }
  if (seq !== historySeq) return;
  const pts = (data.points || []).map((p) => ({ x: +new Date(p.ts), y: p.lqi }));
  if (!pts.length) {
    showChartEmpty('Ancora nessun campione raccolto per questo dispositivo');
    return;
  }
  el('chart-empty').hidden = true;
  document.querySelector('.chartwrap').classList.remove('has-empty');
  if (!chart) chart = createChart();
  if (!chart) return;
  const now = Date.now();
  chart.options.scales.x.min = now - RANGES_MS[range];
  chart.options.scales.x.max = now;
  chart.options.plugins.thresholdBands = { critical: CRITICAL_LQI, warning: warnLine() };
  chart.data.datasets[0].data = pts;
  el('chart').setAttribute('aria-label', `Andamento LQI di ${name}, intervallo ${range}`);
  chart.update();
}

/* ===== Events ===== */
function eventRow(e) {
  return `<li class="ev${e.event_type === 'version_change' ? ' ev-version' : ''}">
  <span class="ev-ts">${fmtDateTime(e.ts)}</span>
  <span class="ev-type">${EVENT_IT[e.event_type] || esc(e.event_type)}</span>
  <span class="ev-dev">${e.device_name ? esc(e.device_name) : '—'}</span>
  <span class="ev-msg">${e.message ? esc(e.message) : ''}</span>
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
      : '<li class="ev ev-none">Nessun evento recente per questo dispositivo.</li>';
  } catch {
    ul.innerHTML = '<li class="ev ev-none">Eventi non disponibili.</li>';
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
    empty.textContent = 'Nessun evento nel periodo selezionato.';
    empty.hidden = rows.length > 0;
    ul.innerHTML = rows.map(eventRow).join('');
  } catch {
    empty.textContent = 'Eventi non disponibili.';
    empty.hidden = false;
  }
}

/* ===== Network map: client-rendered SVG, radial around coordinator ===== */
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

  let edges = '';
  for (const l of links) {
    const s = pos.get(String(l.sourceIeee ?? l.source ?? '').toLowerCase());
    const t = pos.get(String(l.targetIeee ?? l.target ?? '').toLowerCase());
    if (!s || !t) continue;
    const lqi = Number(l.lqi) || 0;
    const col = lqi >= 120 ? '#4FB477' : lqi >= 60 ? '#D9A441' : '#C1533E';
    const w = (0.8 + 3.2 * (lqi / 255)).toFixed(2);
    edges += `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${t.x.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="${col}" stroke-width="${w}" opacity="0.85"><title>LQI ${lqi}</title></line>`;
  }

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
    const r = isC ? 9 : isR ? 6 : 5;
    const named = nameByIeee.get(key(n));
    const label = isC ? 'Coordinatore' : named || shortAddr(n);
    const mono = !isC && !named;
    nodeSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}"><title>${esc(label)}${n.type ? ' · ' + esc(n.type) : ''}</title></circle>
<text x="${p.x.toFixed(1)}" y="${(p.y + r + 14).toFixed(1)}" text-anchor="middle" fill="${mono ? '#8B939B' : '#E4E7EA'}" font-size="${mono ? 9.5 : 10.5}" font-family="${mono ? "'IBM Plex Mono', Menlo, monospace" : "'IBM Plex Sans', sans-serif"}">${esc(label)}</text>`;
  }

  return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mappa della rete Zigbee">${edges}${nodeSvg}</svg>`;
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
  msg.textContent = "Scansione in corso… l'operazione può richiedere alcuni minuti.";
  try {
    await api('/api/network/refresh', { method: 'POST' });
    msg.textContent = 'Snapshot aggiornato.';
    await loadMap();
  } catch (e) {
    if (e.status === 429) msg.textContent = "Richiesta rifiututa: al massimo una scansione manuale all'ora.";
    else if (e.status === 409) msg.textContent = 'Una scansione è già in corso.';
    else msg.textContent = 'Scansione non riuscita (' + (e.message || 'errore') + ').';
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
    <div class="stat"><span class="n">${ds.length}</span><span class="l">Dispositivi</span></div>
    <div class="stat"><span class="n c-ok">${n('ok')}</span><span class="l">Ok</span></div>
    <div class="stat"><span class="n c-warn">${n('warning')}</span><span class="l">Attenzione</span></div>
    <div class="stat"><span class="n c-crit">${n('critical')}</span><span class="l">Critici</span></div>
    <div class="stat"><span class="n" style="color:${statusColorLqi(avgLqi ?? 0, null)}">${avgLqi != null ? avgLqi : '—'}</span><span class="l">LQI medio</span></div>
    <div class="stat"><span class="n${fails > 0 ? ' c-crit' : ''}">${fails}</span><span class="l">Guasti 24h</span></div>`;
  el('home-empty').hidden = ds.length > 0;
}

function renderHomeWatch() {
  const bad = state.devices
    .filter((d) => d.status !== 'ok')
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  el('hm-watch').innerHTML = bad
    .map(
      (d) => `<li><a class="hmrow" href="#/device/${encodeURIComponent(d.name)}">
  <span class="dot dot-${d.status}"></span>
  <span class="hmname">${esc(d.name)}</span>
  <span class="mono hmsub">LQI ${d.currentLqi} · media 24h ${d.avg24h != null ? Math.round(d.avg24h) : '—'} · media 7g ${d.avg7d != null ? Math.round(d.avg7d) : '—'} · guasti 24h ${d.failures24h}</span>
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
      (d) => `<li><a class="hmrow" href="#/device/${encodeURIComponent(d.name)}">
  <span class="dot dot-muted"></span>
  <span class="hmname">${esc(d.name)}</span>
  <span class="mono hmsub">ultimo msg ${d.lastSeen ? fmtFull(d.lastSeen) : 'mai'}</span>
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
          .map(([t, c]) => `<span class="chip"><span class="n">${c}</span>${EVENT_IT[t] || esc(t)}</span>`)
          .join('')
      : '<span class="chip"><span class="n">0</span>eventi</span>';
  } catch {
    el('hm-ev-empty').hidden = false;
    el('hm-chips').innerHTML = '';
  }
}

function renderHomeNet() {
  const box = el('hm-net');
  if (!state.snap || !state.snap.value) {
    box.textContent = 'Nessuno snapshot disponibile.';
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
    return nameByIeee.get(k) || String(ieee ?? '?').slice(-8);
  };
  const weakest = [...links]
    .sort((a, b) => (Number(a.lqi) || 0) - (Number(b.lqi) || 0))
    .slice(0, 3);
  box.innerHTML =
    `${nodes.length} nodi · ${routers} router · ${ends} end device` +
    (weakest.length
      ? '<br>link più deboli:<br>' +
        weakest
          .map((l) => `<span class="mono">${esc(nm(l.sourceIeee))} → ${esc(nm(l.targetIeee))} · LQI ${Number(l.lqi) || 0}</span>`)
          .join('<br>')
      : '');
}

async function loadHomeSnapshot() {
  try {
    state.snap = await api('/api/network/latest');
    el('hm-snap').innerHTML = `Snapshot: <span class="mono">${fmtFull(state.snap.ts)}</span> — <a href="#/map">vedi</a>`;
  } catch {
    state.snap = null;
    el('hm-snap').textContent = 'Nessuna mappa di rete ancora (scansione giornaliera o manuale dalla vista Mappa).';
  }
  renderHomeNet();
}

async function loadHomeTrend() {
  const wrap = document.querySelector('.hmwrap');
  const empty = el('hm-chart-empty');
  let data;
  try {
    data = await api('/api/mesh/history?range=24h');
  } catch {
    empty.hidden = false;
    wrap.classList.add('has-empty');
    return;
  }
  const pts = (data.points || []).map((p) => ({ x: +new Date(p.ts), y: p.lqi }));
  if (!pts.length) {
    empty.hidden = false;
    wrap.classList.add('has-empty');
    return;
  }
  if (typeof Chart === 'undefined') {
    empty.textContent = 'Chart.js non caricato (CDN non raggiungibile o offline)';
    empty.hidden = false;
    wrap.classList.add('has-empty');
    return;
  }
  empty.hidden = true;
  wrap.classList.remove('has-empty');
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
              label: (item) => 'LQI medio ' + item.parsed.y,
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
  el('nav-map').classList.toggle('active', r.view === 'map');
  el('nav-events').classList.toggle('active', r.view === 'events');
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

function init() {
  document.querySelector('.rangebar button[data-range="24h"]').classList.add('active');
  document.querySelector('.rangebar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    state.range = b.dataset.range;
    document.querySelectorAll('.rangebar button').forEach((x) => x.classList.toggle('active', x === b));
    void loadHistory();
  });
  el('ev-filters').addEventListener('submit', (e) => e.preventDefault());
  el('ev-filters').addEventListener('change', () => {
    if (route().view === 'events') void loadEvents();
  });
  el('map-refresh').addEventListener('click', () => void refreshMap());
  window.addEventListener('hashchange', onRoute);
  onRoute();
  void poll();
  setInterval(() => void poll(), 15000);
}

init();
