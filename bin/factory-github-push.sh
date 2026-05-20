#!/usr/bin/env bash
set -euo pipefail
BRANCH=${BRANCH:-main}
REMOTE=${REMOTE:-origin}
MESSAGE=${1:-"chore: sync factorygrid $(date +%Y-%m-%d_%H-%M-%S)"}
cd "${FACTORYGRID_ROOT:-/home/revelation/factorygrid}"
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  cat >&2 <<MSG
[FACTORY_PUSH][FAIL] Remote '$REMOTE' is not configured.
Create a private GitHub repo, then run:
  git remote add origin https://github.com/<owner>/<private-repo>.git
  bin/factory-github-push.sh "initial factory sync"
MSG
  exit 2
fi
git add -A
if git diff --cached --quiet; then
  echo "[FACTORY_PUSH][NOOP] no staged changes"
else
  git commit -m "$MESSAGE"
fi
git branch -M "$BRANCH"
git push -u "$REMOTE" "$BRANCH"
echo "[FACTORY_PUSH][PASS] pushed $BRANCH to $(git remote get-url "$REMOTE")"
