#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

fail=0

bad() {
  printf '[PIN_CHECK][FAIL] %s\n' "$*" >&2
  fail=1
}

ok() {
  printf '[PIN_CHECK][OK] %s\n' "$*"
}

if grep -RInE '(:latest|main-latest|@latest|ruflo@latest|npx[[:space:]]+ruflo@latest)' \
  docker-compose.yml docker .env.example 2>/dev/null; then
  bad "mutable latest runtime reference found"
else
  ok "no latest runtime references in Compose/Docker/env defaults"
fi

for var in QDRANT_IMAGE LITELLM_IMAGE OPENHANDS_IMAGE NODE_BASE_IMAGE RUFLO_VERSION NEO4J_IMAGE CLAUDE_CODE_VERSION; do
  if grep -q "^${var}=" .env.example; then
    ok ".env.example defines $var"
  else
    bad ".env.example missing $var"
  fi
done

for image_var in QDRANT_IMAGE LITELLM_IMAGE OPENHANDS_IMAGE NODE_BASE_IMAGE; do
  value="$(grep "^${image_var}=" .env.example | head -1 | cut -d= -f2-)"
  if [[ "$value" == *'@sha256:'* ]]; then
    ok "$image_var is digest-pinned"
  else
    bad "$image_var is not digest-pinned: ${value:-unset}"
  fi
done

if grep -RInE 'npm install([^[:alnum:]_-]|$)' docker/*/entrypoint.sh; then
  bad "runtime entrypoint contains mutable npm install fallback"
else
  ok "runtime entrypoints use locked npm bootstrap"
fi

if grep -RIn 'npm ci' docker/*/entrypoint.sh >/dev/null; then
  bad "runtime entrypoints call npm ci directly instead of hash-gated bootstrap"
else
  ok "runtime npm ci is centralized behind hash-gated bootstrap"
fi

for helper in docker/ruflo/node-locked-install.sh docker/rufloui/node-locked-install.sh; do
  if [[ -x "$helper" || -f "$helper" ]]; then
    ok "$helper present"
  else
    bad "$helper missing"
  fi
done

if (( fail )); then
  exit 1
fi

printf '[PIN_CHECK][PASS] runtime pinning and locked bootstrap checks passed\n'
