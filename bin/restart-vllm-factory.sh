#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
./bin/stop-vllm-factory.sh
sleep 2
mkdir -p logs
if pgrep -f "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" >/dev/null 2>&1; then
  echo "Refusing to start: existing Qwen vLLM process still running" >&2
  pgrep -af "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" >&2
  exit 1
fi
FACTORYGRID_ROOT="$ROOT" nohup ./bin/start-vllm-factory.sh > logs/vllm-factory.log 2>&1 &
echo $! > logs/vllm-factory.pid
for _ in {1..60}; do
  real_pid="$(ps -eo pid=,cmd= | awk '/\/vllm serve Qwen\/Qwen2.5-Coder-14B-Instruct-AWQ/ && !/awk/ {pid=$1} END {print pid}' || true)"
  if [[ -n "${real_pid:-}" ]]; then
    echo "$real_pid" > logs/vllm-factory.pid
    break
  fi
  sleep 0.5
done
echo "vLLM starting pid=$(cat logs/vllm-factory.pid), log=$ROOT/logs/vllm-factory.log"
