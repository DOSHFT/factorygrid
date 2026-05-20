#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$ROOT"

fail=0
warn=0

section() { printf '\n== %s ==\n' "$1"; }
ok() { printf '[OK] %s\n' "$1"; }
warning() { warn=$((warn + 1)); printf '[WARN] %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf '[FAIL] %s\n' "$1"; }

check_port() {
  local name=$1 url=$2
  if curl -fsS --max-time 5 "$url" >/tmp/factory-doctor.out 2>/tmp/factory-doctor.err; then
    ok "$name reachable: $url"
  else
    bad "$name unreachable: $url ($(tr '\n' ' ' </tmp/factory-doctor.err | cut -c1-160))"
  fi
}

section "identity"
if command -v wslpath >/dev/null 2>&1; then
  ok "running inside WSL"
fi
if [ "$(printf '%s' "${WSL_DISTRO_NAME:-}" | tr '[:upper:]' '[:lower:]')" = "revelation" ]; then
  ok "WSL distro is revelation"
else
  warning "WSL_DISTRO_NAME=${WSL_DISTRO_NAME:-unset}; expected revelation"
fi
ok "factory root: $ROOT"

section "config"
if [ -f .env ]; then ok ".env exists"; else warning ".env missing; copy .env.example to .env"; fi
if grep -RIn 'tvly-[A-Za-z0-9_-]' docker-compose.yml openhands_state 2>/dev/null; then
  bad "hardcoded Tavily-style key still present in compose/state"
else
  ok "no Tavily-style key found in compose/state"
fi

section "compose"
if docker compose config >/tmp/factory-compose-config.yml 2>/tmp/factory-compose-config.err; then
  ok "docker compose config is valid"
else
  bad "docker compose config failed: $(tr '\n' ' ' </tmp/factory-compose-config.err | cut -c1-220)"
fi
docker compose ps || true

section "endpoints"
check_port "vLLM" "http://localhost:8000/v1/models"
check_port "LiteLLM" "http://localhost:4000/v1/models"
check_port "Qdrant" "http://localhost:6333/collections"
check_port "OpenHands" "http://localhost:3000/api/settings"
check_port "RuFlo UI API" "http://localhost:28580/api/system/info"

section "gpu"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits
else
  warning "nvidia-smi not available"
fi

section "memory"
free -h
mem_gib=$(free -g | awk '/^Mem:/ {print $2}')
swap_gib=$(free -g | awk '/^Swap:/ {print $2}')
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

section "protected workspace"
if bin/check-protected-edits.sh --status-only; then
  ok "protected edit guard passed"
else
  warning "protected edit guard reported changes"
fi

section "summary"
printf 'fail=%s warn=%s\n' "$fail" "$warn"
[ "$fail" -eq 0 ]
