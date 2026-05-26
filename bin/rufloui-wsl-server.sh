#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-/mnt/d/UAT/factorygrid}"
NODE="${FACTORYGRID_NODE:-/tmp/factorygrid-node/node}"
UI_DIR="${ROOT}/rufloui"

cd "$UI_DIR"

exec env \
  PORT="${RUFLOUI_PUBLIC_PORT:-28589}" \
  FACTORYGRID_ROOT="$ROOT" \
  RUFLO_PERSIST_DIR="${RUFLO_PERSIST_DIR:-$ROOT/ruflo_project/.rufloui}" \
  QDRANT_URL="${QDRANT_URL:-http://127.0.0.1:16333}" \
  NEO4J_URI="${NEO4J_URI:-bolt://127.0.0.1:7687}" \
  NEO4J_USER="${NEO4J_USER:-neo4j}" \
  NEO4J_PASSWORD="${NEO4J_PASSWORD:-test-local-only}" \
  "$NODE" \
  --require "$UI_DIR/node_modules/tsx/dist/preflight.cjs" \
  --import "file://$UI_DIR/node_modules/tsx/dist/loader.mjs" \
  "$UI_DIR/src/backend/server.ts"
