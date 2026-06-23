#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
lines=${FACTORY_LOG_LINES:-120}
cd "$ROOT"

section() { printf '\n== %s ==\n' "$1"; }

section "compose ps"
docker compose ps || true

section "compose logs"
if [ "$#" -gt 0 ]; then
  docker compose logs --tail="$lines" "$@" || true
else
  docker compose logs --tail="$lines" || true
fi

section "vLLM log"
if [ -f logs/vllm-factory.log ]; then
  tail -n "$lines" logs/vllm-factory.log
else
  printf 'No logs/vllm-factory.log\n'
fi

section "OpenHands logs"
if [ -d logs/openhands ]; then
  find logs/openhands -maxdepth 2 -type f -print | sort | tail -n 10 | while read -r file; do
    printf '\n-- %s --\n' "$file"
    tail -n "$lines" "$file" || true
  done
else
  printf 'No logs/openhands directory\n'
fi

section "RuFlo UI state logs"
if [ -d ruflo_project/.rufloui ]; then
  find ruflo_project/.rufloui -type f \( -name '*.log' -o -name '*.jsonl' \) -print | sort | tail -n 10 | while read -r file; do
    printf '\n-- %s --\n' "$file"
    tail -n "$lines" "$file" || true
  done
else
  printf 'No ruflo_project/.rufloui directory\n'
fi
