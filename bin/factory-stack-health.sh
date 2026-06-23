#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-/home/revelation/factorygrid}

if [ -t 1 ]; then
  green=$'\033[32m'
  red=$'\033[31m'
  yellow=$'\033[33m'
  reset=$'\033[0m'
else
  green=""
  red=""
  yellow=""
  reset=""
fi

ok() { printf "  %sGREEN%s %s\n" "$green" "$reset" "$*"; }
bad() { printf "  %sRED%s   %s\n" "$red" "$reset" "$*"; }
warn() { printf "  %sWARN%s  %s\n" "$yellow" "$reset" "$*"; }

echo "FactoryGrid health:"

if [ "${WSL_DISTRO_NAME:-}" = "Revelation" ]; then
  ok "WSL Revelation running"
elif command -v wsl.exe >/dev/null 2>&1; then
  distro_state=$(wsl.exe -l -v 2>/dev/null | tr -d '\r' | awk '$1 ~ /^\*?Revelation$/ || $2 == "Revelation" { print $0 }' || true)
  if printf "%s" "$distro_state" | grep -q "Running"; then
    ok "WSL Revelation running"
  else
    bad "WSL Revelation not reported running"
  fi
fi

if docker info >/dev/null 2>&1; then
  ok "Docker engine reachable"
else
  bad "Docker engine not reachable"
  exit 0
fi

if [ ! -f "$ROOT/docker-compose.yml" ]; then
  bad "compose file missing at $ROOT/docker-compose.yml"
  exit 0
fi

cd "$ROOT"

services=$(docker compose config --services 2>/dev/null || true)
if [ -z "$services" ]; then
  bad "no compose services found"
  exit 0
fi

while IFS= read -r service; do
  [ -n "$service" ] || continue
  line=$(docker compose ps "$service" --format '{{.Name}}|{{.State}}|{{.Status}}' 2>/dev/null | head -n 1 || true)
  if [ -z "$line" ]; then
    bad "$service missing"
    continue
  fi
  name=${line%%|*}
  rest=${line#*|}
  state=${rest%%|*}
  status=${rest#*|}
  case "$state $status" in
    *running*healthy*)
      ok "$service ($name): $status"
      ;;
    *running*)
      if echo "$status" | grep -qiE "unhealthy|starting"; then
        warn "$service ($name): $status"
      else
        ok "$service ($name): $status"
      fi
      ;;
    *)
      bad "$service ($name): $status"
      ;;
  esac
done <<< "$services"

echo
echo "Hermes URL: http://172.20.86.232:9119/"
echo
echo "FactoryGrid LAN exposure:"
if command -v powershell.exe >/dev/null 2>&1 && [ -x /mnt/c/Windows/System32/netsh.exe ]; then
  wsl_ip=$(hostname -I | awk '{print $1}')
  lan_ip=${FACTORYGRID_LAN_IP:-192.168.178.20}
  proxy=$(/mnt/c/Windows/System32/netsh.exe interface portproxy show v4tov4 2>/dev/null | tr -d '\r' || true)
  if ! printf "%s\n" "$proxy" | grep -qE "[0-9]"; then
    # netsh interop from inside Revelation commonly returns no data (even when proxies are set from host).
    # The ps1 is the source of truth for Revelation LAN exposure. Hermes runs in Decima, not Revelation.
    warn "LAN portproxy details unavailable in this shell (common from inside Revelation). Run from elevated PowerShell on BlackBeast:"
    warn "  powershell -ExecutionPolicy Bypass -File \\\\wsl.localhost\\Revelation\\home\\revelation\\factorygrid\\bin\\factory-expose-lan.ps1"
  else
    for port in 22 28589 28580 3001 3011 4001 6333 18000; do
      if printf "%s\n" "$proxy" | grep -qE "(^|[[:space:]])${port}[[:space:]]"; then
        ok "LAN port $port forwarded to Revelation $wsl_ip:$port"
      else
        bad "LAN port $port not forwarded from Windows to Revelation"
      fi
    done
    if ! printf "%s\n" "$proxy" | awk 'NF >= 4 { found=1 } END { exit !found }'; then
      warn "Run from elevated Windows PowerShell: powershell -ExecutionPolicy Bypass -File \\\\wsl.localhost\\Revelation\\home\\revelation\\factorygrid\\bin\\factory-expose-lan.ps1"
    fi
  fi
else
  warn "Windows portproxy check unavailable from this shell"
fi
