#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
BACKUP_DIR=${FACTORY_BACKUP_DIR:-/home/revelation/factorygrid_backups}
stamp=$(date +%Y%m%d-%H%M%S)
archive="$BACKUP_DIR/factorygrid-${stamp}.tar"

mkdir -p "$BACKUP_DIR"
cd "$(dirname "$ROOT")"

tar \
  --exclude='factorygrid/qdrant_storage' \
  --exclude='factorygrid/ruflo_project/.claude-flow/plugins/node_modules' \
  --exclude='factorygrid/rufloui/node_modules' \
  --exclude='factorygrid/logs/*.log' \
  -cf "$archive" "$(basename "$ROOT")"

sha256sum "$archive" > "${archive}.sha256"
printf '%s\n' "$archive"

