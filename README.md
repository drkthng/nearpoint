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

## Deploy
`deploy-pages.yml` (manual) publishes `dist/` to GitHub Pages. Pages from a private repository needs a paid
GitHub plan; otherwise use another static host or `npm run dev -- --host` on your local network.
