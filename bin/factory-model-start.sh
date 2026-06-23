#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PROFILE="${1:-qwen-coder-awq-daily}"
PROFILE_DIR="$ROOT/runtime/model-profiles"
PROFILE_FILE="$PROFILE_DIR/${PROFILE}.env"

if [[ ! -f "$PROFILE_FILE" ]]; then
  echo "Unknown model profile: $PROFILE" >&2
  echo "Available profiles:" >&2
  find "$PROFILE_DIR" -maxdepth 1 -type f -name '*.env' -printf '  %f\n' | sed 's/\.env$//' >&2
  exit 2
fi

# shellcheck disable=SC1090
source "$PROFILE_FILE"
ENGINE="${ENGINE:-}"
MODEL="${MODEL:-}"

case "$ENGINE" in
  vllm)
    "$ROOT/bin/stop-vllm-factory.sh" || true
    mkdir -p "$ROOT/logs"
    FACTORYGRID_ROOT="$ROOT" FACTORY_MODEL_PROFILE_FILE="$PROFILE_FILE" \
      nohup "$ROOT/bin/start-vllm-factory.sh" > "$ROOT/logs/vllm-factory.log" 2>&1 &
    echo $! > "$ROOT/logs/vllm-factory.pid"
    echo "Started vLLM profile '$PROFILE' pid=$(cat "$ROOT/logs/vllm-factory.pid") log=$ROOT/logs/vllm-factory.log"
    ;;
  ollama)
    if [[ "${REQUIRES_ISOLATION:-false}" == "true" && "${FACTORY_ALLOW_REDTEAM_MODEL:-}" != "yes" ]]; then
      echo "Profile '$PROFILE' is a red-team profile. Set FACTORY_ALLOW_REDTEAM_MODEL=yes to start it." >&2
      exit 3
    fi
    if ! command -v ollama >/dev/null 2>&1; then
      echo "ollama is not installed or not on PATH" >&2
      exit 127
    fi
    if ! curl -fsS --max-time 2 "http://127.0.0.1:${PORT:-11434}/api/tags" >/dev/null 2>&1; then
      nohup ollama serve > "$ROOT/logs/ollama.log" 2>&1 &
      echo $! > "$ROOT/logs/ollama.pid"
      sleep 2
    fi
    if ! ollama list | awk '{print $1}' | grep -Fxq "$MODEL"; then
      echo "Model '$MODEL' is not pulled. Run: ollama pull $MODEL" >&2
      exit 4
    fi
    echo "Ollama profile '$PROFILE' is available at http://127.0.0.1:${PORT:-11434}"
    ;;
  external)
    echo "Profile '$PROFILE' is external/review-only. Configure provider routing before start." >&2
    exit 5
    ;;
  *)
    echo "Unsupported ENGINE in $PROFILE_FILE: ${ENGINE:-unset}" >&2
    exit 2
    ;;
esac
