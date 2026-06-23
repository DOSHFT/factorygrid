#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WHAT="${1:-all}"

case "$WHAT" in
  all|vllm)
    if systemctl --user cat factory-vllm.service >/dev/null 2>&1; then
      systemctl --user stop factory-vllm.service || true
      systemctl --user disable factory-vllm.service >/dev/null 2>&1 || true
      systemctl --user mask factory-vllm.service >/dev/null 2>&1 || true
      systemctl --user reset-failed factory-vllm.service >/dev/null 2>&1 || true
      for _ in {1..20}; do
        if ! systemctl --user is-active --quiet factory-vllm.service 2>/dev/null; then
          break
        fi
        sleep 0.5
      done
    fi
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
