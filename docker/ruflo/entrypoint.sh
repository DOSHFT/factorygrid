#!/usr/bin/env bash
set -euo pipefail

cd /app

if [ -f package-lock.json ]; then
  npm ci --include=dev || npm install --include=dev
else
  npm install --include=dev
fi

ruflo start || true
ruflo daemon start -w map,audit,optimize,consolidate,testgaps,document,benchmark,predict || true
sleep 2
ruflo daemon enable -w predict || true
ruflo daemon enable -w document || true
ruflo mcp stop || true
ruflo mcp start -t http -p "${RUFLO_MCP_PORT:-3010}" &
exec tail -f /dev/null
