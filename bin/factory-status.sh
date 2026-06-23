#!/usr/bin/env bash
set -euo pipefail
ROOT=${FACTORYGRID_ROOT:-}
if [ -z "$ROOT" ]; then
  if [ -f /home/revelation/factorygrid/docker-compose.yml ]; then
    ROOT=/home/revelation/factorygrid
  else
    ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
  fi
fi
printf "== environment ==\n"
printf "WSL_DISTRO_NAME=%s\n" "${WSL_DISTRO_NAME:-unset}"
printf "factory root=%s\n" "$ROOT"
command -v docker >/dev/null 2>&1 && docker compose ls || true
printf "\n"
printf "== sockets ==\n"
ss -ltnp | grep -E ":(3000|4000|6333|6334|18000)" || true
printf "\n== compose health ==\n"
docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Health}}\t{{.Ports}}" 2>/dev/null || docker compose ps || true
printf "\n== gpu ==\n"
nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits || true
printf "\n== memory ==\n"
free -h
printf "\n== docker ==\n"
docker ps --format "{{.Names}}\t{{.Status}}" || true
printf "\n== endpoints ==\n"
for url in http://localhost:18000/v1/models http://localhost:4001/v1/models http://localhost:6333/collections http://localhost:3001/api/settings http://localhost:28580/api/system/info http://localhost:28580/api/factory/guide http://localhost:28589/factory; do
  printf "%s -> " "$url"
  curl -fsS --max-time 3 "$url" >/tmp/factory-status.out 2>/tmp/factory-status.err && head -c 160 /tmp/factory-status.out || cat /tmp/factory-status.err
  printf "\n"
done
