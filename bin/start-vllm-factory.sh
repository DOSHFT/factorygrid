#!/usr/bin/env bash
set -euo pipefail

export CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-0}
export VLLM_WORKER_MULTIPROC_METHOD=${VLLM_WORKER_MULTIPROC_METHOD:-spawn}
export PYTORCH_CUDA_ALLOC_CONF=${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}
export TMPDIR=${TMPDIR:-/tmp}
export TEMP=${TEMP:-/tmp}
export TMP=${TMP:-/tmp}

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PROFILE_FILE="${FACTORY_MODEL_PROFILE_FILE:-$ROOT/runtime/vllm-model.env}"

if [[ -f "$PROFILE_FILE" ]]; then
  # shellcheck disable=SC1091
  source "$PROFILE_FILE"
fi
MODEL=${MODEL:-Qwen/Qwen2.5-Coder-14B-Instruct-AWQ}
SERVED_MODEL_NAME=${SERVED_MODEL_NAME:-factory-active}
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-18000}
GPU_MEM=${GPU_MEM:-0.72}
MAX_MODEL_LEN=${MAX_MODEL_LEN:-22528}
MAX_NUM_SEQS=${MAX_NUM_SEQS:-2}
MAX_BATCHED_TOKENS=${MAX_BATCHED_TOKENS:-22528}
SWAP_SPACE_GB=${SWAP_SPACE_GB:-4}
LOG_LEVEL=${VLLM_LOGGING_LEVEL:-info}
QUANTIZATION=${QUANTIZATION:-}
ENFORCE_EAGER=${ENFORCE_EAGER:-false}

echo "Starting FactoryGrid vLLM"
echo "profile=$PROFILE_FILE"
echo "model=$MODEL served_model_name=$SERVED_MODEL_NAME host=$HOST port=$PORT gpu_mem=$GPU_MEM max_model_len=$MAX_MODEL_LEN max_num_seqs=$MAX_NUM_SEQS max_batched_tokens=$MAX_BATCHED_TOKENS swap_gb=$SWAP_SPACE_GB quantization=${QUANTIZATION:-auto} enforce_eager=$ENFORCE_EAGER + auto-tool-choice + hermes parser (for Hermes tool calling)"

VLLM_BIN="${VLLM_BIN:-/home/revelation/vllm-env/bin/vllm}"
if [[ ! -x "$VLLM_BIN" ]]; then
  echo "vLLM binary not executable: $VLLM_BIN" >&2
  exit 127
fi

args=(
  serve "$MODEL"
  --served-model-name "$SERVED_MODEL_NAME" \
  --host "$HOST" \
  --port "$PORT" \
  --dtype auto \
  --gpu-memory-utilization "$GPU_MEM" \
  --max-model-len "$MAX_MODEL_LEN" \
  --max-num-seqs "$MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MAX_BATCHED_TOKENS" \
  --swap-space "$SWAP_SPACE_GB" \
  --uvicorn-log-level "$LOG_LEVEL" \
  --enable-prefix-caching \
  --disable-log-requests \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
)

if [[ "$ENFORCE_EAGER" == "true" || "$ENFORCE_EAGER" == "1" ]]; then
  args+=(--enforce-eager)
fi

if [[ -n "$QUANTIZATION" && "$QUANTIZATION" != "none" ]]; then
  args+=(--quantization "$QUANTIZATION")
fi

exec "$VLLM_BIN" "${args[@]}"
