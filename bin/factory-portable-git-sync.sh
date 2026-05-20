#!/usr/bin/env bash
set -euo pipefail
UAT_COPY=${UAT_COPY:-/mnt/d/UAT/factorygrid}
PORTABLE_BARE=${PORTABLE_BARE:-/mnt/d/UAT/factorygrid-portable.git}
REMOTE=${REMOTE:-portable-local}
MESSAGE=${1:-"chore: portable factory sync $(date +%Y-%m-%d_%H-%M-%S)"}
if [ ! -d "$UAT_COPY" ]; then
  echo "[PORTABLE_SYNC][FAIL] missing UAT copy: $UAT_COPY" >&2
  exit 2
fi
cd "$UAT_COPY"
if [ ! -d .git ]; then
  git init
fi
git config user.name "${GIT_AUTHOR_NAME:-$(git -C /home/revelation/factorygrid config user.name 2>/dev/null || echo FactoryGrid)}"
git config user.email "${GIT_AUTHOR_EMAIL:-$(git -C /home/revelation/factorygrid config user.email 2>/dev/null || echo factorygrid@local)}"
git branch -M main
if [ ! -d "$PORTABLE_BARE/refs" ]; then
  mkdir -p "$PORTABLE_BARE"
  git init --bare "$PORTABLE_BARE"
fi
git --git-dir="$PORTABLE_BARE" symbolic-ref HEAD refs/heads/main || true
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  git remote add "$REMOTE" "$PORTABLE_BARE"
fi
git add -A
if git diff --cached --name-only | grep -Ev '(^|/)\.env\.example$' | grep -Ei '(^|/)(\.env|.*secret.*|.*credential.*|.*credentials.*|.*\.key|.*\.pem|openhands_state|qdrant_storage|node_modules|logs/)'; then
  echo '[PORTABLE_SYNC][FAIL] secret/runtime path staged' >&2
  exit 3
fi
if git diff --cached --quiet; then
  echo '[PORTABLE_SYNC][NOOP] no portable changes to commit'
else
  git commit -m "$MESSAGE"
fi
git push -u "$REMOTE" main
echo "[PORTABLE_SYNC][PASS] bare=$PORTABLE_BARE head=$(git rev-parse --short HEAD)"
