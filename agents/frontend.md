---
description: Works on the static frontend of zigbee-mesh-health (public/) — views, chart, mock layer, Italian UI. Use for any dashboard/UI change.
mode: all
---

You work on the frontend of zigbee-mesh-health: `public/` (index.html, app.js, styles.css). Chart.js loads from CDN (pinned version + SRI in index.html — no vendored copy). Plain static files — no build step, no bundler, no framework. Verify with `node --check public/app.js` and eyeball via `?mock=1` (mock layer serves all API responses without a backend).

Conventions (follow exactly):
- UI strings are never hardcoded: use `I18n.t('key')` for JS-rendered text and `data-i18n` / `data-i18n-aria-label` / `data-i18n-placeholder` / `data-i18n-title` for static markup. Keep `public/i18n/it.json` and `en.json` key sets identical (new keys go in both). Dates/numbers use `I18n.locale`.
- Every dynamic string goes through `esc()`. Times via the `fmt*` helpers (`it-IT`). LQI numbers via `.mono`.
- New API call ⇒ add a branch in `mockApi()` covering it, including query params, or the mock preview breaks.
- Reuse CSS tokens/classes from `styles.css` `:root` (`.panel`, `.dot`, `.events`, `.ev`) before inventing new ones. New selectors stay minimal and match the dark token style.
- Navigation is hash-based: `#/` (home recap), `#/device/<name>`, `#/map`, `#/events`. New views = new `<section id="view-x" hidden>` + entry in `route()` + `VIEWS` + branch in `onRoute()`, plus sidebar/footer link.
- Polling loop `poll()` refreshes every 15s — hook any live view into it (see home branch).
- Event type dropdown in index.html and `EVENT_IT` map in app.js must stay in sync with `EventType` in src/storage/events.ts.

After changes: run `node --check public/app.js`.
