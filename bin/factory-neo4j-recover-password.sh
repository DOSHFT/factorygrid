#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

die() {
  printf '[NEO4J_RECOVERY][FAIL] %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[NEO4J_RECOVERY] %s\n' "$*"
}

read_env_value() {
  local key=$1 file=${2:-.env} raw
  [ -f "$file" ] || return 1
  raw=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 | sed -E "s/^[[:space:]]*${key}=//") || return 1
  raw=${raw%%#*}
  raw=${raw%$'\r'}
  raw=${raw%\"}
  raw=${raw#\"}
  raw=${raw%\'}
  raw=${raw#\'}
  printf '%s' "$raw"
}

[ -f docker-compose.yml ] || die "docker-compose.yml missing"
[ -f .env ] || die ".env missing; cannot choose the desired persisted Neo4j password"
command -v docker >/dev/null 2>&1 || die "docker is required"

desired_password="$(read_env_value NEO4J_PASSWORD .env || true)"
[ -n "$desired_password" ] || die "NEO4J_PASSWORD is missing from .env"
if [ "${#desired_password}" -lt 8 ]; then
  die "NEO4J_PASSWORD must be at least 8 characters for Neo4j"
fi

if docker exec factory_neo4j cypher-shell -u neo4j -p "$desired_password" "RETURN 1;" >/dev/null 2>&1; then
  log "Neo4j already accepts the .env password"
  exit 0
fi

log "stopping normal Neo4j service"
docker compose stop neo4j >/dev/null
docker rm -f factory_neo4j_recovery >/dev/null 2>&1 || true

cleanup() {
  docker rm -f factory_neo4j_recovery >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "starting isolated Neo4j recovery container with auth disabled"
docker compose run -d --no-deps \
  --name factory_neo4j_recovery \
  -e NEO4J_AUTH=none \
  -e NEO4J_dbms_security_auth__enabled=false \
  neo4j >/dev/null

log "waiting for recovery database"
ready=0
for _ in $(seq 1 60); do
  if docker exec factory_neo4j_recovery cypher-shell "RETURN 1;" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" -eq 1 ] || die "recovery database did not become ready"

log "setting Neo4j admin password to the .env value"
python3 - "$desired_password" <<'PY' | docker exec -i factory_neo4j_recovery cypher-shell >/dev/null
import sys

password = sys.argv[1].replace("\\", "\\\\").replace("'", "\\'")
print(f"ALTER USER neo4j SET PASSWORD '{password}' CHANGE NOT REQUIRED;")
PY

log "stopping recovery container and restarting normal Neo4j"
docker rm -f factory_neo4j_recovery >/dev/null
trap - EXIT
docker compose up -d neo4j >/dev/null

log "waiting for normal Neo4j health"
healthy=0
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' factory_neo4j 2>/dev/null || true)"
  if [ "$status" = healthy ]; then
    healthy=1
    break
  fi
  sleep 2
done
[ "$healthy" -eq 1 ] || die "Neo4j did not become healthy after password recovery"

docker exec factory_neo4j cypher-shell -u neo4j -p "$desired_password" "RETURN 1;" >/dev/null
log "Neo4j password recovery complete"
