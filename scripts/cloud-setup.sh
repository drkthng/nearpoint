#!/usr/bin/env bash
# Runs at the start of every Claude Code session (see .claude/settings.json).
# In cloud sessions it installs project dependencies; locally it only installs if node_modules is missing.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
  echo "nearpoint: dependencies installed"
fi
