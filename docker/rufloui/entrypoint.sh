#!/usr/bin/env bash
set -euo pipefail

cd /ui

if [ -f package-lock.json ]; then
  npm ci --legacy-peer-deps || npm install --legacy-peer-deps
else
  npm install --legacy-peer-deps
fi

if [ -f /factorygrid/bin/factory-agent-growth.mjs ]; then
  node /factorygrid/bin/factory-agent-growth.mjs || true
fi

exec npm run dev
