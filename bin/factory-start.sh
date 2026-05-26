#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

PORTS="${FACTORYGRID_STACK_PORTS:-28580 28588 28589 3000 3001 3010 3011 4000 4001 6333 6334 7474 7687}"
SERVICES="${FACTORYGRID_SERVICES:-neo4j qdrant litellm ruflo_orchestrator rufloui qwen_code_worker openhands_engineer}"

log() { printf '[factory-start] %s\n' "$*"; }
warn() { printf '[factory-start][WARN] %s\n' "$*" >&2; }
die() { printf '[factory-start][FAIL] %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required"
}

port_pids() {
  local port="$1"
  { ss -ltnp 2>/dev/null \
    | awk -v p=":$port" '$4 ~ p"$" {print $0}' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p'
    ps -eo pid,args \
      | awk -v p="-host-port "port '$0 ~ p {print $1}'
  } | sort -u
}

container_for_port() {
  case "$1" in
    28580|28588|28589) printf 'factory_rufloui' ;;
    3000|3001) printf 'agent_openhands' ;;
    3010|3011) printf 'factory_ruflo' ;;
    4000|4001) printf 'factory_litellm' ;;
    6333|6334) printf 'factory_qdrant' ;;
    7474|7687) printf 'factory_neo4j' ;;
    *) printf '' ;;
  esac
}

container_running() {
  local name="$1"
  [ -n "$name" ] || return 1
  [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)" = true ]
}

kill_stale_listeners() {
  local any=0
  for port in $PORTS; do
    local container
    container="$(container_for_port "$port")"
    if container_running "$container"; then
      log "port $port belongs to running $container; keeping it"
      continue
    fi
    while read -r pid; do
      [ -n "$pid" ] || continue
      local cmd
      cmd="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
      warn "stopping stale listener pid=$pid cmd=${cmd:-unknown} port=$port"
      if ! kill "$pid" >/dev/null 2>&1; then
        warn "could not stop pid=$pid; rerun with root if this port remains blocked"
      fi
      any=1
    done < <(port_pids "$port")
  done
  if [ "$any" -eq 1 ]; then
    sleep 2
  fi
}

check_endpoint() {
  local name="$1" url="$2"
  if curl -fsS --max-time 10 "$url" >/tmp/factory-start.out 2>/tmp/factory-start.err; then
    log "$name OK: $url"
  else
    warn "$name not ready: $url ($(tr '\n' ' ' </tmp/factory-start.err | cut -c1-180))"
    return 1
  fi
}

need docker
need ss
need curl

[ -f .env ] || die ".env missing; copy .env.example to .env and set local secrets"

if command -v powershell.exe >/dev/null 2>&1; then
  if powershell.exe -NoProfile -Command "netsh interface portproxy show all" 2>/dev/null \
    | tr -d '\r' \
    | grep -Eq '0\.0\.0\.0[[:space:]]+(28580|28588|28589|6333|6334|3011|4001)'; then
    warn "Windows portproxy rules exist for FactoryGrid ports. Docker cannot publish those ports until an elevated PowerShell removes or updates the rules."
    warn "Admin cleanup: netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=28589"
  fi
fi

if ! container_running factory_qdrant; then
  # Docker Desktop can leave stale WSL port forwards after an interrupted qdrant container.
  # Keep the internal service at qdrant:6333 and move only the host bindings.
  export QDRANT_HTTP_PORT="${FACTORYGRID_QDRANT_HTTP_PORT:-16333}"
  export QDRANT_GRPC_PORT="${FACTORYGRID_QDRANT_GRPC_PORT:-16334}"
  warn "factory_qdrant is not running; using host fallback ports ${QDRANT_HTTP_PORT}/${QDRANT_GRPC_PORT}"
fi

if ! container_running agent_openhands; then
  export OPENHANDS_PORT="${FACTORYGRID_OPENHANDS_PORT:-13000}"
  warn "agent_openhands is not running; using host fallback port ${OPENHANDS_PORT}"
fi

log "validating compose"
compose_config_tmp="$(mktemp)"
docker compose config >"$compose_config_tmp"

log "removing exited compose containers without deleting volumes"
docker compose rm -f >/dev/null 2>&1 || true

log "clearing stale listeners on FactoryGrid ports"
kill_stale_listeners

log "starting services: $SERVICES"
docker compose up -d --build $SERVICES

log "waiting for health checks"
for _ in $(seq 1 60); do
  neo4j="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' factory_neo4j 2>/dev/null || true)"
  qdrant="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' factory_qdrant 2>/dev/null || true)"
  rufloui="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' factory_rufloui 2>/dev/null || true)"
  if [ "$neo4j" = healthy ] && [ "$qdrant" = healthy ] && [ "$rufloui" = healthy ]; then
    break
  fi
  sleep 5
done

docker compose ps

fail=0
check_endpoint "RuFloUI API" "http://127.0.0.1:${RUFLOUI_API_PORT:-28580}/api/system/info" || fail=1
check_endpoint "RuFloUI Fabric" "http://127.0.0.1:${RUFLOUI_VITE_PORT:-28588}/monitoring/fabric" || fail=1
check_endpoint "Qdrant" "http://127.0.0.1:${QDRANT_HTTP_PORT:-6333}/collections" || fail=1
check_endpoint "Neo4j HTTP" "http://127.0.0.1:${NEO4J_HTTP_PORT:-7474}" || true

[ "$fail" -eq 0 ] || die "stack started with endpoint failures"
log "stack ready: http://192.168.178.20:${RUFLOUI_VITE_PORT:-28588}/monitoring/fabric"
