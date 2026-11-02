# Near-vision trainer

A personal research instrument that reimplements the published perceptual-learning protocol behind
GlassesOff / Oryx (Gabor contrast detection with collinear flankers, crowding and backward masking).
Not a medical device. Background: `docs/research/oryx-near-vision-report.html`.

## Local
```
npm ci
npm test
npm run dev        # add -- --host to open it from an iPad on the same network
```

## Claude Code cloud sessions
1. Push this folder to a private GitHub repository.
2. At claude.ai/code, connect GitHub and install the Claude GitHub App with access to this repository.
3. Use a cloud environment with the default Trusted network access. No setup script is needed:
   `.claude/settings.json` runs `scripts/cloud-setup.sh` at session start to install dependencies.
4. Follow `docs/sessions.md`: start S1–S4 as four parallel sessions with the prompt given there.
5. Sessions commit straight to `main`; CI runs typecheck, tests and build on every push.

## Deploy
`deploy-pages.yml` (manual) publishes `dist/` to GitHub Pages. Pages from a private repository needs a paid
GitHub plan; otherwise use another static host or `npm run dev -- --host` on your local network.
