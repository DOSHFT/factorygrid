#!/usr/bin/env bash
set -euo pipefail
printf "== sockets ==\n"
ss -ltnp | grep -E ":(3000|4000|6333|6334|8000)" || true
printf "\n== compose health ==\n"
docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Health}}\t{{.Ports}}" 2>/dev/null || docker compose ps || true
printf "\n== gpu ==\n"
nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits || true
printf "\n== memory ==\n"
free -h
printf "\n== docker ==\n"
docker ps --format "{{.Names}}\t{{.Status}}" || true
printf "\n== endpoints ==\n"
for url in http://localhost:8000/v1/models http://localhost:4000/v1/models http://localhost:6333/collections http://localhost:3000/api/settings http://localhost:28580/api/system/info; do
  printf "%s -> " "$url"
  curl -fsS --max-time 3 "$url" >/tmp/factory-status.out 2>/tmp/factory-status.err && head -c 160 /tmp/factory-status.out || cat /tmp/factory-status.err
  printf "\n"
done
