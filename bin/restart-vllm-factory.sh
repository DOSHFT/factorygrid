#!/usr/bin/env bash
set -euo pipefail
cd /home/revelation/factorygrid
./bin/stop-vllm-factory.sh
sleep 2
nohup ./bin/start-vllm-factory.sh > logs/vllm-factory.log 2>&1 &
echo $! > logs/vllm-factory.pid
echo "vLLM starting pid=$(cat logs/vllm-factory.pid), log=/home/revelation/factorygrid/logs/vllm-factory.log"
