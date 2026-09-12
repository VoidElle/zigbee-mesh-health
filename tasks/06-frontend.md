# 06 — Frontend: 4 views + design tokens

**Depends on:** 01 (for repo conventions); consumes the API contract below (task 05 implements it — build the frontend against this contract, optionally with a small mock fetch layer you can toggle). Read `/instruction.md` §8 first — design section is the core of this task.

## Files

All under `public/` (vanilla HTML/CSS/JS, no framework, no build step):
- `index.html`, `styles.css`, `app.js`
- `vendor/chart.umd.js` — download Chart.js UMD once (e.g. `curl -o public/vendor/chart.umd.js https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js`) and commit the file.

## API contract (from task 05)

```
GET  /api/devices        → { devices: [{ name, ieee, currentLqi, status, avg24h, avg7d, failures24h }] }
GET  /api/devices/:name/history?range=24h|7d|30d → { name, range, points: [{ ts, lqi }] }
GET  /api/events?type=&since=  → { events: [{ ts, event_type, device_name, message }] }
GET  /api/network/latest → { ts, value: { nodes:[…], links:[{ source, target, lqi … }] } } | 404
POST /api/network/refresh → { ok, error? }   (429 rate-limited, 409 in-flight)
GET  /api/health         → { mqttConnected, lastSampleAt, lastSnapshotAt }
```

## Design tokens (spec §8.2 — apply exactly)

```css
--bg-base:#14171A; --bg-panel:#1C2024; --border:#2A2F35;
--text-primary:#E4E7EA; --text-muted:#8B939B;
--status-ok:#4FB477; --status-warning:#D9A441; --status-critical:#C1533E;
```

Fonts: `IBM Plex Sans` (UI) + `IBM Plex Mono` (all numbers: LQI, timestamps, IEEE addresses) via Google Fonts `<link>` with system fallbacks. Tight scale: page title / section title / body-data / secondary label.

## Layout & views (spec §8.3–8.4)

Desktop: fixed narrow left sidebar (device list) + main detail panel; footer link/tab to network map. Mobile: full-width list; tapping a device navigates to detail (hash routes like `#/device/<name>`, `#/map`, `#/events`). Left-aligned everywhere. ASCII wireframe in the spec is your guide.

1. **Device list (sidebar):** name, colored status dot, current LQI in mono; sorted critical → warning → ok.
2. **Device detail:** Chart.js line chart of LQI with range selector (24h/7d/30d); light colored band under warning/critical thresholds (use threshold lines: dotted amber at `(avg7d·(1−pct))` is optional; at minimum color points/segments by status); recent events for the device; IEEE address; empty state: "Ancora nessun campione raccolto per questo dispositivo".
3. **Network map:** client-rendered SVG graph — nodes = devices from snapshot links (coordinator highlighted as central if identifiable); edge **width** and **color** map to link `lqi` (thicker/greener = better); deterministic simple layout (e.g. radial around coordinator) — no heavy graph libs; snapshot timestamp prominent; refresh button labelled `Aggiorna mappa (operazione lenta, max 1/ora)`; on 429 show the rate-limit message.
4. **Events view:** filter by `event_type` dropdown + since selector; list with mono timestamps; correlatable with version_change/restart events (visually highlight `version_change` rows subtly).

## Behaviour

- Polling: refresh devices/health every ~15s; charts re-render with a smooth (<=300ms) transition only.
- Everything else static; zero decorative animation.
- Keyboard-focus-visible styles on all interactive elements; verify contrast on dark bg.

UI copy in Italian (matches the spec wireframe).

## Acceptance criteria

- `npm run build` unaffected; works when opened against the Express server (task 05) or standalone with mocked responses disabled by default.
- Mark checkbox in `tasks/README.md`.
