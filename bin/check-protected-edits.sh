#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$ROOT"

status_only=false
if [ "${1:-}" = "--status-only" ]; then status_only=true; fi

protected_regex='(^|/)(docker-compose\.ya?ml|\.env(\..*)?|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.toml|Cargo\.lock|requirements\.txt|pyproject\.toml|litellm_config\.yaml|openhands_state/settings\.json|bin/start-vllm-factory\.sh)$'

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if $status_only; then exit 0; fi
  printf 'No git repository detected. Initialize git before autonomous edits for diff/rollback safety.\n' >&2
  exit 1
fi

changed=$(git status --porcelain=v1 | awk '{print $2}' | grep -E "$protected_regex" || true)
if [ -n "$changed" ]; then
  printf 'Protected files changed. Human review required before execution continues:\n%s\n' "$changed" >&2
  exit 1
fi

exit 0

