#!/usr/bin/env bash
set -euo pipefail
if [ $# -lt 1 ]; then
  echo "usage: $0 <huggingface-model-id>" >&2
  exit 2
fi
cd /home/revelation/factorygrid
MODEL="$1" ./bin/restart-vllm-factory.sh
