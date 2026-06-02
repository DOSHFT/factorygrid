#!/usr/bin/env bash
set -euo pipefail
if [ $# -lt 1 ]; then
  echo "usage: $0 <huggingface-model-id>" >&2
  exit 2
fi

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"
MODEL="$1" FACTORYGRID_ROOT="$ROOT" ./bin/restart-vllm-factory.sh
