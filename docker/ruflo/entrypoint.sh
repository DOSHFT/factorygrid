#!/usr/bin/env bash
set -euo pipefail

cd /app

if [ -f package-lock.json ]; then
  npm ci --include=dev || npm install --include=dev
else
  npm install --include=dev
fi

cleanup() {
  ruflo mcp stop >/dev/null 2>&1 || true
  ruflo daemon stop >/dev/null 2>&1 || true
  jobs -pr | xargs -r kill >/dev/null 2>&1 || true
  wait || true
}
trap cleanup TERM INT EXIT

ruflo start || true
ruflo daemon start -w map,audit,optimize,consolidate,testgaps,document,benchmark,predict || true
sleep 2
ruflo daemon enable -w predict || true
ruflo daemon enable -w document || true
ruflo mcp stop || true
ruflo mcp start -t http -p "${RUFLO_MCP_PORT:-3010}" &

while true; do
  # Keep bash as PID 1 so it can reap exited child processes from RuFlo/claude-flow.
  wait -n || true
  sleep 1
done
