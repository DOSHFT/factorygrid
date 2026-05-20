#!/usr/bin/env bash
set -euo pipefail
pkill -f "vllm serve Qwen/Qwen2.5-Coder-14B-Instruct-AWQ" || true
pkill -f "vllm.entrypoints.openai.api_server" || true
