# 11 — Home Assistant add-on: install, verify, document "how to add"

**Depends on:** 08, 09, 10. Needs a real HA instance (any install type; HAOS/Container both fine).

## Step 1 — Install on a real HA instance

Two paths, verify at least the first:

**A. Local repository (dev path, no GHCR needed):**
1. On the HA host: `git clone` this repo (HAOS: use the Samba/SSH add-on or Advanced SSH; Container: clone next to the HA config dir).
2. HA UI: **Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories** → add the full path to the cloned repo (e.g. `/addons/zigbee-mesh-health` — the directory containing `repository.yaml`).
3. Refresh the store → "Zigbee Mesh Health" appears → **Install**. (No `image:` → HA builds the Docker image locally, takes minutes on ARM due to better-sqlite3.)
4. Start the Mosquitto broker add-on (or note external broker), go to the add-on **Configuration** tab, set options.
5. **Start**. Check the add-on **Log** for `Starting zigbee-mesh-health (broker ...)`.

**B. Published repository (after task 10's images exist):**
1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories** → add `https://github.com/lucadelc/zigbee-mesh-health`.
2. Install → configure → start (pulls prebuilt image, fast).

## Step 2 — Smoke checklist on the running add-on

- [ ] Sidebar entry "Zigbee Mesh Health" opens the dashboard via ingress (login-protected by HA).
- [ ] Log shows MQTT connected to the Mosquitto service (no `mqtt_host` option set) — or to the external broker when set.
- [ ] Zigbee2MQTT devices appear in the dashboard (`/api/devices`) and LQI samples accumulate.
- [ ] `bridge/info` events recorded; event view non-empty after any bridge activity.
- [ ] Manual networkmap trigger works from the UI (or returns the documented 429/409/timeout object — not a crash).
- [ ] **Restart the add-on → data survives** (SQLite in `/data`), dashboard shows the same history.
- [ ] **HA backup → restore → data survives** (`/data` included).
- [ ] Watchdog/restart loop not triggered; add-on stays up with the broker stopped (log warns, no crash-restart loop) — mirrors the standalone behavior.
- [ ] Direct port path: enable port 8080 in the add-on Network section with `api_key` set → `curl -H "x-api-key: ..." http://<host>:8080/api/health` returns 200.

## Step 3 — Document "how to add" for end users

Add an **"Home Assistant add-on"** section to the repo `README.md` (after the Docker section) with the two install paths from Step 1, the options pointers, and the sidebar/ingress note. Keep it short — `addon/DOCS.md` (task 09) carries the detail.

## Step 4 — Close out

- [ ] All Phase 2 checkboxes in `tasks/README.md` are `[x]`.
- [ ] No scope creep: no HA custom component/sensors, no notifications integration, no multi-instance support. It stays a passive monitor with a web UI.
- [ ] Mark your own checkbox in `tasks/README.md`.
