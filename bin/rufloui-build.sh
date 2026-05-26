#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
UI_DIR="${ROOT}/rufloui"
NODE_IMAGE="${RUFLOUI_NODE_IMAGE:-node:20-slim}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for the pinned RuFloUI build lane" >&2
  exit 1
fi

if [ ! -f "${UI_DIR}/package.json" ]; then
  echo "RuFloUI package.json not found at ${UI_DIR}" >&2
  exit 1
fi

docker run --rm \
  -v "${UI_DIR}:/work" \
  -w /work \
  "${NODE_IMAGE}" \
  bash -lc "npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ && npm run build"
