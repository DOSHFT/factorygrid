#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$ROOT"

tail_lines=${1:-160}

printf '== docker compose logs ==\n'
docker compose logs --tail "$tail_lines" || true

printf '\n== vLLM log ==\n'
tail -n "$tail_lines" logs/vllm-factory.log 2>/dev/null || true

printf '\n== OpenHands logs dir ==\n'
find logs/openhands -maxdepth 2 -type f -print -exec tail -n 40 {} \; 2>/dev/null || true

