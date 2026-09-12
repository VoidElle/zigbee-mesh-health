# 09 — Home Assistant add-on: ingress wiring, DOCS.md, icons, translations

**Depends on:** 08.

## Step 1 — Verify ingress compatibility (no code change expected)

The frontend is served by Express at `/` and the API at `/api/*`. Under HA ingress every request arrives with a rewritten `Host` and a path prefix? — verify: HA ingress proxies to `ingress_port` with the **original paths** (`/`, `/api/...`), no base-path prefix. Check:

- No absolute URL assumptions in `public/index.html` / `public/app.js` (must use relative paths — they already do).
- No `Host`-header checks in Express.
- Chart.js and static assets load via relative paths under ingress.

If any absolute-path bug surfaces, fix it in `public/` (frontend files only — this task owns `public/` changes if needed; keep them minimal).

## Step 2 — `addon/DOCS.md`

This is the README shown in the HA add-on store. Cover, in order:

1. One-paragraph pitch (passive LQI monitoring, no extra radio traffic).
2. Why the networkmap is rare (active scan hammers the mesh; 1/day + 1/hour rate-limited manual trigger) — copy the wording idea from repo `README.md` §"The three data channels".
3. Setup: either connect the **Mosquitto broker add-on** (service auto-discovery, nothing to type) or enter an external `mqtt_host`/`mqtt_port`/credentials.
4. Options table (same fields as `config.yaml` options + meaning of each threshold — reuse the repo README table wording).
5. Access: sidebar panel via ingress (HA-authenticated). Optional direct port for external API use → set `api_key` first.
6. Data & backups: SQLite in `/data`, included in HA backups automatically; retention behavior.

## Step 3 — Icons

- `addon/logo.png` — 256×256, `addon/icon.png` — 128×128. Simple: mesh/network nodes + signal bars motif, flat, readable at small size. Generating a clean two-color PNG (e.g. via ImageMagick or any local tool) is fine; do not pull in npm icon dependencies.

## Step 4 — Translations

- `addon/translations/en.yaml`:
```yaml
configuration:
  mqtt_host:
    name: External MQTT host
    description: Leave empty to use the connected Mosquitto broker add-on.
```
Cover at least `mqtt_host`, `mqtt_port`, `mqtt_username`, `mqtt_password`, `base_topic`, `api_key`. Other option keys can stay untranslated (HA falls back to the key name).

## Acceptance criteria

- [ ] Ingress rendering verified: sidebar opens the dashboard, assets and API calls work with no mixed-content or path errors (can be verified on a local HA dev instance, or by reasoning over the code if no instance is available — state which was done).
- [ ] `addon/DOCS.md` covers all 6 points above.
- [ ] `addon/logo.png` (256×256) and `addon/icon.png` (128×128) exist and are valid PNGs.
- [ ] `addon/translations/en.yaml` exists, valid YAML, keys match `config.yaml` option names.
- [ ] Mark your checkbox in `tasks/README.md`.
