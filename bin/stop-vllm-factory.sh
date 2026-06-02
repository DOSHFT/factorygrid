#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
pkill -f "vllm serve" || true
pkill -f "vllm.entrypoints.openai.api_server" || true
rm -f logs/vllm-factory.pid
