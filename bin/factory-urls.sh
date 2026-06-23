#!/usr/bin/env bash
set -euo pipefail

lan_ip="${FACTORYGRID_LAN_IP:-192.168.178.20}"

cat <<EOF

FactoryGrid / Revelation
  root:   /home/revelation/factorygrid
  start:  cd /home/revelation/factorygrid && bin/factory-stack.sh start
  status: cd /home/revelation/factorygrid && bin/factory-stack.sh status
  doctor: cd /home/revelation/factorygrid && bin/factory-env.sh
  restart all: cd /home/revelation/factorygrid && bin/factory-stack.sh restart
  restart UI:  cd /home/revelation/factorygrid && bin/factory-stack.sh restart rufloui
  expose LAN:  run on BlackBeast in elevated PowerShell:
               powershell -ExecutionPolicy Bypass -File \\\\wsl.localhost\\Revelation\\home\\revelation\\factorygrid\\bin\\factory-expose-lan.ps1

$(if [ -x /home/revelation/factorygrid/bin/factory-stack-health.sh ]; then /home/revelation/factorygrid/bin/factory-stack-health.sh; fi)

From DarkStar or another LAN machine, use BlackBeast's LAN IP.
Do not use localhost from DarkStar.

LAN URLs:
  RuFloUI Factory:  http://${lan_ip}:28589/factory
  RuFloUI Learning: http://${lan_ip}:28589/learning
  RuFloUI Agents:   http://${lan_ip}:28589/agents
  RuFloUI Tasks:    http://${lan_ip}:28589/tasks
  RuFloUI Logs:     http://${lan_ip}:28589/logs
  OpenHands:        http://${lan_ip}:3001
  Qdrant:           http://${lan_ip}:6333/dashboard

LAN APIs:
  RuFloUI API:      http://${lan_ip}:28580/api/system/info
  RuFlo MCP:        http://${lan_ip}:3011/health
  LiteLLM:          http://${lan_ip}:4001/v1/models
  vLLM:             http://${lan_ip}:18000/v1/models

SSH:
  ssh revelation@${lan_ip}

EOF
