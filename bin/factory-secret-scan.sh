#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git worktree: $ROOT" >&2
  exit 1
fi

patterns=(
  'tvly-[A-Za-z0-9_-]{16,}'
  'factory-secret-key'
  'ultron2026securechangeME[[:alnum:]_!@#$%^&*()+=.-]*'
  'ghp_[A-Za-z0-9_]{20,}'
)

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

fail=0
for pattern in "${patterns[@]}"; do
  if git grep -n -E "$pattern" -- . ':!docs/historical/**' ':!bin/factory-secret-scan.sh' >"$tmp"; then
    cat "$tmp" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "Secret scan failed. Replace concrete credentials with .env references or non-secret placeholders." >&2
  exit 1
fi

echo "Secret scan passed for tracked files."
