#!/usr/bin/env bash
set -euo pipefail

cd /ui

if [ -x /factorygrid/bin/factory-claude-local.mjs ]; then
  ln -sf /factorygrid/bin/factory-claude-local.mjs /usr/local/bin/claude
fi


factory-node-locked-install /ui --legacy-peer-deps

if [ -f /factorygrid/bin/factory-agent-growth.mjs ]; then
  node /factorygrid/bin/factory-agent-growth.mjs || true
fi

exec npm run dev
