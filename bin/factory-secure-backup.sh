#!/usr/bin/env bash
set -euo pipefail
ROOT=${FACTORYGRID_ROOT:-/home/revelation/factorygrid}
UAT_COPY=${UAT_COPY:-/mnt/d/UAT/factorygrid}
UAT_BARE=${UAT_BARE:-/mnt/d/UAT/factorygrid.git}
MESSAGE=${1:-"chore: secure factory backup $(date +%Y-%m-%d_%H-%M-%S)"}
cd "$ROOT"
"$ROOT/bin/factory-uat-copy.sh" "$UAT_COPY"
"$ROOT/bin/factory-portable-git-sync.sh" "$MESSAGE"
if [ ! -d "$UAT_BARE/refs" ]; then
  mkdir -p "$UAT_BARE"
  git init --bare "$UAT_BARE"
fi
git --git-dir="$UAT_BARE" symbolic-ref HEAD refs/heads/main || true
if ! git remote get-url uat-local >/dev/null 2>&1; then
  git remote add uat-local "$UAT_BARE"
fi
git add -A
if git diff --cached --name-only | grep -Ev '(^|/)\.env\.example$' | grep -Ei '(^|/)(\.env|.*secret.*|.*credential.*|.*credentials.*|.*\.key|.*\.pem|openhands_state|qdrant_storage|node_modules|logs/)'; then
  echo '[SECURE_BACKUP][FAIL] secret/runtime path staged' >&2
  exit 3
fi
if git diff --cached --quiet; then
  echo '[SECURE_BACKUP][NOOP] no new source changes to commit'
else
  git commit -m "$MESSAGE"
fi
git branch -M main
git push uat-local main
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  echo '[SECURE_BACKUP][WARN] GitHub origin not configured; local bare repo updated only.'
fi
echo "[SECURE_BACKUP][PASS] copy=$UAT_COPY bare=$UAT_BARE head=$(git rev-parse --short HEAD)"
