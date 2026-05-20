#!/usr/bin/env bash
set -euo pipefail

run_id=${1:-run-$(date +%Y%m%d-%H%M%S)}
root=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
backup_dir=${FACTORY_BACKUP_DIR:-/home/revelation/factorygrid_backups}
artifact_dir="$root/workspace/dr"
stamp=$(date +%Y%m%d-%H%M%S)
archive="$backup_dir/factorygrid-${run_id}-${stamp}.tar"
manifest="$artifact_dir/${run_id}_snapshot.json"

mkdir -p "$backup_dir" "$artifact_dir"
cd "$(dirname "$root")"

tar \
  --exclude='factorygrid/.git' \
  --exclude='factorygrid/qdrant_storage' \
  --exclude='factorygrid/ruflo_project/node_modules' \
  --exclude='factorygrid/rufloui/node_modules' \
  --exclude='factorygrid/logs/*.log' \
  -cf "$archive" "$(basename "$root")"

sha256=$(sha256sum "$archive" | awk '{print $1}')
printf '%s  %s\n' "$sha256" "$archive" > "${archive}.sha256"

cat > "$manifest" <<JSON
{
  "run_id": "$run_id",
  "created_at": "$(date -Iseconds)",
  "archive": "$archive",
  "sha256": "$sha256",
  "policy": "YOLO allowed only after this snapshot exists"
}
JSON

printf '%s\n' "$manifest"

