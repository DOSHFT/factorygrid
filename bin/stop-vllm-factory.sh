#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PID_FILE="$ROOT/logs/vllm-factory.pid"

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
fi

pkill -f "/vllm.* serve " || true
pkill -f "vllm serve" || true
pkill -f "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" || true
pkill -f "vllm.entrypoints.openai.api_server" || true

for _ in {1..20}; do
  if ! pgrep -f "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    exit 0
  fi
  sleep 0.5
done

pkill -9 -f "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" || true
sleep 1
if pgrep -f "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" >/dev/null 2>&1; then
  echo "vLLM stop failed: Qwen process still running" >&2
  pgrep -af "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" >&2 || true
  exit 1
fi
rm -f "$PID_FILE"
