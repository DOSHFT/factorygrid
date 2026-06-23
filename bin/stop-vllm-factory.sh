#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PID_FILE="$ROOT/logs/vllm-factory.pid"

if systemctl --user is-active --quiet factory-vllm.service 2>/dev/null; then
  systemctl --user stop factory-vllm.service || true
fi

list_vllm_pids() {
  ps -eo pid=,cmd= |
    awk '
      /awk / || /bash -lc/ || /sh -c/ || /pgrep / || /grep / { next }
      /\/vllm serve / || / vllm serve / || /vllm\.entrypoints\.openai\.api_server/ { print $1 }
    '
}

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
fi

while read -r pid; do
  [[ -n "${pid:-}" ]] || continue
  kill "$pid" 2>/dev/null || true
done < <(list_vllm_pids)

for _ in {1..20}; do
  if [[ -z "$(list_vllm_pids)" ]]; then
    rm -f "$PID_FILE"
    exit 0
  fi
  sleep 0.5
done

while read -r pid; do
  [[ -n "${pid:-}" ]] || continue
  kill -9 "$pid" 2>/dev/null || true
done < <(list_vllm_pids)
sleep 1
if [[ -n "$(list_vllm_pids)" ]]; then
  echo "vLLM stop failed: vLLM process still running" >&2
  ps -eo pid=,cmd= | awk '/\/vllm serve / || / vllm serve / || /vllm\.entrypoints\.openai\.api_server/ { print }' >&2
  exit 1
fi
rm -f "$PID_FILE"
