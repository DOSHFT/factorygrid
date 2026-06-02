#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
./bin/stop-vllm-factory.sh
sleep 2
FACTORYGRID_ROOT="$ROOT" nohup ./bin/start-vllm-factory.sh > logs/vllm-factory.log 2>&1 &
echo $! > logs/vllm-factory.pid
echo "vLLM starting pid=$(cat logs/vllm-factory.pid), log=$ROOT/logs/vllm-factory.log"
