#!/usr/bin/env bash
set -euo pipefail
pkill -f "vllm serve" || true
pkill -f "vllm.entrypoints.openai.api_server" || true
rm -f logs/vllm-factory.pid
