#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WHAT="${1:-all}"

case "$WHAT" in
  all|vllm)
    "$ROOT/bin/stop-vllm-factory.sh" || true
    ;;
esac

case "$WHAT" in
  all|ollama)
    if [[ -f "$ROOT/logs/ollama.pid" ]]; then
      pid=$(cat "$ROOT/logs/ollama.pid" 2>/dev/null || true)
      if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$ROOT/logs/ollama.pid"
    fi
    ;;
esac

echo "Stopped model runtime target: $WHAT"
