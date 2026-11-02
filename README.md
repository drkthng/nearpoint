# nearpoint

Perceptual-learning trainer for near vision. Adaptive Gabor contrast detection with collinear flankers, crowding and backward masking, reimplementing the published Polat/GlassesOff protocol. Frame-exact WebGL2, dithered sub-1 % contrast, simulated-observer tests. Personal research tool, not a medical device.

Background: `docs/research/oryx-near-vision-report.html`.

## Local
```
npm ci
npm test
npm run dev        # add -- --host to open it from the phone (S24) on the same network
```

## Claude Code cloud sessions
1. Push this folder to a private GitHub repository.
2. At claude.ai/code, connect GitHub and install the Claude GitHub App with access to this repository.
3. Use a cloud environment with the default Trusted network access. No setup script is needed:
   `.claude/settings.json` runs `scripts/cloud-setup.sh` at session start to install dependencies.
4. Start sessions with the one-line prompt in `docs/roadmap.md`; each session claims the next eligible
   step there, so several can run in parallel. Scope per session is in `docs/sessions.md`.
5. Sessions commit straight to `main`; CI runs typecheck, tests and build on every push.

## Install on the phone (Galaxy S24, Chrome)
nearpoint is a Progressive Web App: after the first load it runs fully offline, and all data stays on the
phone (IndexedDB). Installing, offline use, fullscreen and the screen wake lock need a **secure origin**
(HTTPS, or `localhost`), so serve a build over HTTPS (see Deploy below).

1. Open the app's HTTPS address in **Chrome** (not Samsung Internet).
2. Chrome menu (⋮) → **Add to home screen** → **Install**. Open nearpoint from the home-screen icon;
   it starts fullscreen in landscape.
3. Phone settings for every session: Display → Motion smoothness **Standard** (60 Hz); Screen mode
   **Natural**; Adaptive brightness **off**; Eye comfort shield **off**; brightness at maximum. Keep
   battery saver off (it can lower the refresh rate).
4. Calibrate in the installed app (calibrations are stored per origin: a browser tab and the installed
   app on the same address share the data; a different address does not).
5. Updates: when a new version has been deployed, the start screen shows "A new version of nearpoint is
   ready" — tap **Reload** (never during a session). To keep data safe, download a JSON backup (Data) before
   uninstalling the app or clearing Chrome's site data: both delete the IndexedDB data.

Local network only (no HTTPS): `npm run dev -- --host` works for a quick look, but Chrome treats the LAN
address as insecure, so there is no install, offline mode or wake lock. As a stopgap, add the address under
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` on the phone.

## Deploy
`npm run build` writes a static site to `dist/` (relative paths, so any sub-path works) including the
service worker `sw.js`, generated at build time with the list of built files (`src/pwa/sw-source.ts`,
plugin in `vite.config.ts`). Any static HTTPS host works:

- **GitHub Pages**: run the manual workflow `deploy-pages.yml` (Actions → Deploy to GitHub Pages → Run
  workflow) after enabling Settings → Pages → Source: GitHub Actions. Pages from a private repository
  needs a paid GitHub plan.
- **Cloudflare Pages / Netlify** (free, works with a private repository): build command `npm run build`,
  output directory `dist`; or upload `dist/` by drag and drop.

The service worker caches only the app's own files and never contacts another origin (CLAUDE.md
non-negotiable 8).

## PWA checks
Lighthouse removed its PWA category in version 12 (2024), so CI checks the same things directly in the
e2e job: Chrome's own installability check (`Page.getInstallabilityErrors` must be empty), the manifest,
service-worker control, and an offline reload of the built app (`e2e/pwa.spec.ts`).
