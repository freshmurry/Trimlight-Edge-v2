# Trimlight Edge v2

A single-file Cloudflare Worker that serves the full "House With the Cool Door Trimlights" PWA: Tesla Mobile + iOS-native controls for Trimlight Edge permanent roofline lighting, offline-first, with a built-in edge proxy to the Trimlight V2 API.

One file, no build step: `index.js` holds the HTML template, the inline client app, and every API route. `wrangler.jsonc` points `main` at `index.js` directly (no Static Assets, no `dist/`).

## Deploy

```bash
cd trimlight-edge-v2
npx wrangler deploy
```

That publishes the Worker at `https://trimlight-edge-v2.<your-subdomain>.workers.dev`. The app works immediately in **Simulation Mode**: every control, scene, zone override, voice command, and the LED visualizer run locally, and `/api/apply` returns HTTP 200 `{ simulated: true, appliedState }` without touching Trimlight.

## Secrets (set these to go live)

```bash
npx wrangler secret put TRIMLIGHT_API_ID
npx wrangler secret put TRIMLIGHT_API_SECRET
npx wrangler secret put TRIMLIGHT_DEVICE_ID
```

- `TRIMLIGHT_API_ID` — Trimlight API client ID
- `TRIMLIGHT_API_SECRET` — Trimlight API client secret (used for HMAC-SHA256 signing; never shipped to the browser)
- `TRIMLIGHT_DEVICE_ID` — the device ID of the house controller
- `APP_PIN` — optional. When set, cross-origin / programmatic callers must send `X-App-Pin: <pin>` on `/api/*`. Same-origin browser requests from the app itself are allowed without the PIN (the browser cannot hold the secret).

Until all three Trimlight values are set, the app stays in Simulation Mode. When they are set, `/api/apply` signs each request (HMAC-SHA256, `Trimlight|<clientId>|<timestamp>`) and proxies to `TRIMLIGHT_BASE_URL` (default `https://trimlight.ledhue.com/trimlight`, overridable in `wrangler.jsonc` vars).

## What is inside

- **Control tab** — live 60fps LED strip visualizer (one strip per zone, sized to the real roofline runs: Left Gables 42 ft, Entry Gable 32 ft, Right Main Gable 28 ft, Right Inner Gable 49 ft, 151 ft total), zone filter pills, quick-action bar (Power, Voice AI, 2700K Warm, Pattern, Scenes), color / pattern / effect rows, Tesla precision brightness and speed sliders with haptic ticks.
- **Zones tab** — independent color/power overrides per zone, one-tap clear back to the global pattern, and editable measured run lengths.
- **Scenes tab** — full CRUD scenes (name, category, nodes, zone overrides, effect, brightness, speed), 4 starter presets, search and filter chips, duplicate/rename/delete, JSON export/import in Settings.
- **Settings** — dark/light theme, backup, connection diagnostics, optional App PIN field.
- **Voice AI** — Web Speech API plus a text fallback; Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) when the AI binding is attached, on-device natural-language parser otherwise, so commands always work.
- **Offline-first PWA** — `manifest.webmanifest`, service worker (`/sw.js`, stale-while-revalidate, `/api/*` bypassed), state and queued edits in `localStorage`, flush on `online`.
- **API** — `GET /api/health`, `POST /api/apply`, `GET | POST | DELETE /api/presets` (Cloudflare KV, local-only fallback when KV is unbound), `POST /api/voice`. Also `/robots.txt`, `/sitemap.xml`, `/llms.txt`.

## Deliberate security note

The page uses a per-request CSP nonce on its single inline `<script>` block (`script-src 'nonce-...'`). There are **no inline event-handler attributes** anywhere; every control is wired with `addEventListener` inside the script block. The inline `<style>` block is allowed via `style-src 'unsafe-inline'`, which is the deliberate choice for this single-file build.
