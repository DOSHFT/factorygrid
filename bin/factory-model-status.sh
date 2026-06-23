#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

echo "FactoryGrid model runtimes"
echo
echo "Profiles:"
find "$ROOT/runtime/model-profiles" -maxdepth 1 -type f -name '*.env' -printf '  %f\n' | sed 's/\.env$//'

echo
echo "vLLM:"
vllm_rows=$(ps -eo pid=,cmd= | awk '/awk / || /bash -lc/ || /sh -c/ || /grep / { next } /\/vllm serve / || / vllm serve / { print }')
if [[ -n "$vllm_rows" ]]; then
  printf '%s\n' "$vllm_rows"
  curl -fsS --max-time 3 http://127.0.0.1:18000/v1/models 2>/dev/null | head -c 300 || true
  echo
else
  echo "  stopped"
fi

echo
echo "Ollama:"
if curl -fsS --max-time 2 http://127.0.0.1:11434/api/tags >/tmp/factory-ollama-tags.json 2>/dev/null; then
  echo "  API reachable at http://127.0.0.1:11434"
  head -c 300 /tmp/factory-ollama-tags.json
  echo
else
  echo "  stopped or unreachable"
fi
rm -f /tmp/factory-ollama-tags.json

echo
echo "GPU:"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits
else
  echo "  nvidia-smi unavailable"
fi
