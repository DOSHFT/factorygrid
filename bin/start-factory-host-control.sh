#!/usr/bin/env bash
set -euo pipefail
cd /home/revelation/factorygrid
mkdir -p logs
nohup python3 ./bin/factory-host-control.py > logs/factory-host-control.log 2>&1 &
echo $! > logs/factory-host-control.pid
echo "Factory host control starting pid=$(cat logs/factory-host-control.pid), log=/home/revelation/factorygrid/logs/factory-host-control.log"
