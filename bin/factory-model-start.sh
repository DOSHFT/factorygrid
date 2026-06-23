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
    cp "$PROFILE_FILE" "$ROOT/runtime/vllm-model.env"
    if systemctl --user cat factory-vllm.service >/dev/null 2>&1; then
      systemctl --user unmask factory-vllm.service >/dev/null 2>&1 || true
      systemctl --user reset-failed factory-vllm.service >/dev/null 2>&1 || true
      systemctl --user start factory-vllm.service
      echo "Started systemd vLLM profile '$PROFILE' via factory-vllm.service"
    else
      FACTORYGRID_ROOT="$ROOT" FACTORY_MODEL_PROFILE_FILE="$PROFILE_FILE" \
        nohup "$ROOT/bin/start-vllm-factory.sh" > "$ROOT/logs/vllm-factory.log" 2>&1 &
      echo $! > "$ROOT/logs/vllm-factory.pid"
      echo "Started vLLM profile '$PROFILE' pid=$(cat "$ROOT/logs/vllm-factory.pid") log=$ROOT/logs/vllm-factory.log"
    fi
    ;;
  vllm_remote|openai_compatible|litellm)
    BASE_URL="${BASE_URL:-${FACTORY_MODEL_BASE_URL:-http://127.0.0.1:18000/v1}}"
    MODELS_URL="${BASE_URL%/}/models"
    tmp_models="$(mktemp)"
    if ! curl -fsS --max-time "${FACTORY_MODEL_CHECK_TIMEOUT:-5}" "$MODELS_URL" > "$tmp_models"; then
      rm -f "$tmp_models"
      echo "Remote model profile '$PROFILE' is not reachable at $MODELS_URL" >&2
      echo "Start or expose the selected vLLM/OpenAI-compatible backend, then retry." >&2
      exit 6
    fi
    echo "Remote model profile '$PROFILE' is reachable at $BASE_URL"
    if [[ -n "$MODEL" ]]; then
      if python3 - "$tmp_models" "$MODEL" <<'PY'
import json
import sys

path, model = sys.argv[1], sys.argv[2]
data = json.load(open(path, "r", encoding="utf-8"))
ids = {item.get("id") for item in data.get("data", []) if isinstance(item, dict)}
if model in ids:
    sys.exit(0)
print("available models: " + ", ".join(sorted(i for i in ids if i))[:500])
sys.exit(1)
PY
      then
        echo "Remote backend reports model '$MODEL'."
      else
        if [[ "${FACTORY_STRICT_MODEL_MATCH:-no}" == "yes" ]]; then
          rm -f "$tmp_models"
          echo "Remote backend is reachable but did not report model '$MODEL'." >&2
          exit 7
        fi
        echo "Remote backend is reachable; exact model id '$MODEL' was not reported. Set FACTORY_STRICT_MODEL_MATCH=yes to make this fatal."
      fi
    fi
    rm -f "$tmp_models"
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
