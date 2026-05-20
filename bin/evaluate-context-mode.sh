#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  printf 'npm is required to evaluate context-mode.\n' >&2
  exit 1
fi

if ! command -v context-mode >/dev/null 2>&1; then
  printf 'context-mode is not installed. Installing in npm global scope for evaluation.\n'
  npm install -g context-mode
fi

printf 'Running context-mode doctor...\n'
context-mode ctx_doctor || context-mode doctor || true

printf '\nNext manual checks:\n'
printf '1. Add context-mode as an MCP server in ruflo_project/.mcp.json if doctor passes.\n'
printf '2. Run ctx_stats before and after a RuFlo/OpenHands test task.\n'
printf '3. Keep it out of production routing until it proves stable with Node 20.\n'

