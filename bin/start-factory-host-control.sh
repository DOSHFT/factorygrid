#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
mkdir -p logs

PID_FILE="logs/factory-host-control.pid"
if [ -s "$PID_FILE" ]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" >/dev/null 2>&1; then
    echo "Factory host control already running pid=$old_pid"
    exit 0
  fi
fi

FACTORYGRID_ROOT="$ROOT" nohup python3 ./bin/factory-host-control.py > logs/factory-host-control.log 2>&1 &
echo $! > logs/factory-host-control.pid
echo "Factory host control starting pid=$(cat logs/factory-host-control.pid), log=$ROOT/logs/factory-host-control.log"
