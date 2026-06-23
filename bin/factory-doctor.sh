#!/usr/bin/env bash
set -u

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$ROOT" || exit 2

fail=0
warn=0
tmp_dir=${TMPDIR:-/tmp}

section() { printf '\n== %s ==\n' "$1"; }
ok() { printf '[OK] %s\n' "$1"; }
warning() { warn=$((warn + 1)); printf '[WARN] %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '[FAIL] %s\n' "$1"; }

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

port_from_file() {
  local key=$1 file=$2 fallback=$3 value
  value=$(read_env_value "$key" "$file" 2>/dev/null || true)
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf '%s' "$fallback"
  fi
}

check_cmd() {
  local name=$1 cmd=$2
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$name available"
  else
    bad "$name missing ($cmd)"
  fi
}

check_http() {
  local name=$1 url=$2 required=${3:-required}
  local out="$tmp_dir/factory-doctor.$$.out" err="$tmp_dir/factory-doctor.$$.err"
  if curl -fsS --max-time 5 "$url" >"$out" 2>"$err"; then
    ok "$name reachable: $url"
  else
    local msg
    msg=$(tr '\n' ' ' <"$err" | cut -c1-180)
    if [ "$required" = "optional" ]; then
      warning "$name unavailable: $url ($msg)"
    else
      bad "$name unreachable: $url ($msg)"
    fi
  fi
  rm -f "$out" "$err"
}

check_tcp() {
  local name=$1 host=$2 port=$3 required=${4:-required}
  if timeout 3 bash -c "</dev/tcp/${host}/${port}" >/dev/null 2>&1; then
    ok "$name TCP reachable: ${host}:${port}"
  else
    if [ "$required" = "optional" ]; then
      warning "$name TCP unavailable: ${host}:${port}"
    else
      bad "$name TCP unreachable: ${host}:${port}"
    fi
  fi
}

section "identity"
if command -v wslpath >/dev/null 2>&1; then
  ok "running inside WSL"
else
  warning "not running inside WSL; run with: wsl -d revelation -- bash -lc 'cd /home/revelation/factorygrid && bin/factory-doctor.sh'"
fi

distro_lc=$(printf '%s' "${WSL_DISTRO_NAME:-}" | tr '[:upper:]' '[:lower:]')
if [ "$distro_lc" = "revelation" ]; then
  ok "WSL distro is revelation"
else
  warning "WSL_DISTRO_NAME=${WSL_DISTRO_NAME:-unset}; expected revelation"
fi
ok "factory root: $ROOT"

section "tools"
check_cmd "curl" curl
check_cmd "docker" docker
check_cmd "git" git
if command -v nvidia-smi >/dev/null 2>&1; then
  ok "nvidia-smi available"
else
  warning "nvidia-smi not available"
fi

section "config"
if [ -f .env ]; then
  ok ".env exists"
else
  warning ".env missing; copy .env.example to .env"
fi
if [ -f .env.example ]; then
  ok ".env.example exists"
else
  warning ".env.example missing"
fi
if [ -x ./bin/factory-secret-scan.sh ]; then
  if ./bin/factory-secret-scan.sh >/tmp/factory-secret-scan.out 2>/tmp/factory-secret-scan.err; then
    ok "tracked secret scan passed"
  else
    bad "tracked secret scan failed: $(tr '\n' ' ' </tmp/factory-secret-scan.err | cut -c1-220)"
  fi
elif grep -RIn 'tvly-[A-Za-z0-9_-]' docker-compose.yml openhands_state 2>/dev/null; then
  bad "hardcoded Tavily-style key still present in compose/state"
else
  ok "no Tavily-style key found in compose/state"
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "factory root is a git worktree"
else
  bad "factory root is not a git worktree"
fi

section "compose"
if docker info >/dev/null 2>&1; then
  ok "Docker engine reachable"
else
  bad "Docker engine not reachable"
fi
if docker compose config >"$tmp_dir/factory-compose-config.$$.yml" 2>"$tmp_dir/factory-compose-config.$$.err"; then
  ok "docker compose config is valid"
else
  bad "docker compose config failed: $(tr '\n' ' ' <"$tmp_dir/factory-compose-config.$$.err" | cut -c1-220)"
fi
rm -f "$tmp_dir/factory-compose-config.$$.yml" "$tmp_dir/factory-compose-config.$$.err"
docker compose ps || true
neo4j_container_health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' factory_neo4j 2>/dev/null || true)
case "$neo4j_container_health" in
  healthy) ok "Neo4j container health is healthy" ;;
  unhealthy) bad "Neo4j container health is unhealthy; run bin/factory-neo4j-recover-password.sh if auth drift is reported" ;;
  starting) warning "Neo4j container health is still starting" ;;
  "") warning "Neo4j container not found" ;;
  *) warning "Neo4j container health is $neo4j_container_health" ;;
esac
section "endpoints"
vllm_port=$(port_from_file PORT runtime/vllm-model.env 18000)
model_required=${FACTORY_REQUIRE_MODEL:-no}
if [ "$model_required" = "yes" ] || [ "$model_required" = "true" ]; then
  vllm_required=required
else
  vllm_required=optional
fi
litellm_private_port=4000
litellm_lan_port=4001
qdrant_port=$(port_from_file QDRANT_HTTP_PORT .env 6333)
openhands_port=$(port_from_file OPENHANDS_PORT .env 3000)
ruflo_mcp_port=$(port_from_file RUFLO_MCP_PORT .env 3011)
rufloui_api_port=$(port_from_file RUFLOUI_API_PORT .env 28580)
rufloui_web_port=$(port_from_file RUFLOUI_VITE_PORT .env 28589)

check_http "vLLM primary" "http://127.0.0.1:${vllm_port}/v1/models" "$vllm_required"
if [ "$vllm_port" != "8000" ]; then
  check_http "vLLM legacy/compat 8000" "http://127.0.0.1:8000/v1/models" optional
fi
check_http "LiteLLM private" "http://127.0.0.1:${litellm_private_port}/v1/models"
check_http "LiteLLM LAN proxy" "http://127.0.0.1:${litellm_lan_port}/v1/models" optional
check_http "Qdrant" "http://127.0.0.1:${qdrant_port}/collections"
check_http "OpenHands" "http://127.0.0.1:${openhands_port}/api/settings"
check_tcp "RuFlo MCP" "127.0.0.1" "$ruflo_mcp_port"
check_http "RuFlo UI API" "http://127.0.0.1:${rufloui_api_port}/api/system/info"
check_http "Factory API" "http://127.0.0.1:${rufloui_api_port}/api/factory/guide"
check_http "Factory UI route" "http://127.0.0.1:${rufloui_web_port}/factory"

section "gpu"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits || warning "nvidia-smi query failed"
  qwen_count=$(ps -eo pid=,cmd= |
    awk '/awk / || /bash -lc/ || /sh -c/ || /grep / || /pgrep / { next } /\/vllm serve / || / vllm serve / || /vllm\.entrypoints\.openai\.api_server/ { count++ } END { print count + 0 }')
  if [ "${qwen_count:-0}" -gt 0 ]; then
    ok "model runtime process count: $qwen_count"
  elif [ "$vllm_required" = "optional" ]; then
    warning "no vLLM/Qwen runtime process found; model runtime is stopped by default"
  else
    bad "no vLLM/Qwen runtime process found"
  fi
else
  warning "nvidia-smi not available"
fi

section "memory"
free -h || warning "free command failed"
mem_gib=$(free -g 2>/dev/null | awk '/^Mem:/ {print $2}')
swap_gib=$(free -g 2>/dev/null | awk '/^Swap:/ {print $2}')
if [ "${mem_gib:-0}" -lt 45 ]; then
  warning "WSL RAM is ${mem_gib:-unknown}GiB; expected about 48GiB"
else
  ok "WSL RAM target appears applied"
fi
if [ "${swap_gib:-0}" -lt 20 ]; then
  warning "WSL swap is ${swap_gib:-unknown}GiB; expected about 24GiB"
else
  ok "WSL swap target appears applied"
fi

section "disk"
df -h "$ROOT" || warning "disk check failed"

section "protected workspace"
if [ -x bin/check-protected-edits.sh ]; then
  if bin/check-protected-edits.sh --status-only; then
    ok "protected edit guard passed"
  else
    warning "protected edit guard reported changes"
  fi
else
  warning "protected edit guard missing or not executable"
fi

section "summary"
printf 'fail=%s warn=%s\n' "$fail" "$warn"
[ "$fail" -eq 0 ]
