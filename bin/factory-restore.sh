#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  bin/factory-restore.sh BACKUP.tar.gz          # inspect only
  bin/factory-restore.sh --apply BACKUP.tar.gz  # restore selected files after backup

Default mode never overwrites the live stack.
EOF
}

apply=false
if [ "${1:-}" = "--apply" ]; then
  apply=true
  shift
fi
archive=${1:-}
if [ -z "$archive" ]; then
  usage
  exit 2
fi

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
restore_root=${FACTORY_RESTORE_WORKDIR:-/tmp/factorygrid-restore}
stamp=$(date -u +%Y%m%dT%H%M%SZ)

if [ ! -f "$archive" ]; then
  printf 'Archive not found: %s\n' "$archive" >&2
  exit 1
fi
if [ -f "${archive}.sha256" ]; then
  sha256sum -c "${archive}.sha256"
fi

rm -rf "$restore_root"
mkdir -p "$restore_root"
tar -xzf "$archive" -C "$restore_root"
bundle=$(find "$restore_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)
if [ -z "$bundle" ] || [ ! -f "$bundle/MANIFEST.txt" ]; then
  printf 'Invalid backup bundle: MANIFEST.txt missing\n' >&2
  exit 1
fi

printf 'Backup manifest:\n'
sed 's/^/  /' "$bundle/MANIFEST.txt"
printf '\nBundle files:\n'
find "$bundle" -maxdepth 3 -type f | sed "s#^$bundle/##" | sort | head -n 200

if [ "$apply" != true ]; then
  printf '\nDry-run only. Re-run with --apply to restore selected config/runtime/state files.\n'
  exit 0
fi

pre="$ROOT.pre-restore-$stamp"
mkdir -p "$pre"
for path in docker-compose.yml litellm_config.yaml .env.example todo-factory.md runtime; do
  if [ -e "$ROOT/$path" ]; then
    mkdir -p "$pre/$(dirname "$path")"
    cp -a "$ROOT/$path" "$pre/$path"
  fi
done

copy_back() {
  local src=$1 dst=$2
  if [ -e "$bundle/$src" ]; then
    mkdir -p "$(dirname "$ROOT/$dst")"
    rm -rf "$ROOT/$dst"
    cp -a "$bundle/$src" "$ROOT/$dst"
  fi
}

copy_back config/docker-compose.yml docker-compose.yml
copy_back config/litellm_config.yaml litellm_config.yaml
copy_back config/.env.example .env.example
copy_back config/.env .env
copy_back config/todo-factory.md todo-factory.md
copy_back runtime/runtime runtime
copy_back state/ruflo_project ruflo_project
copy_back state/rufloui-persist rufloui/.rufloui
copy_back state/openhands_state openhands_state

printf 'Restore applied. Previous selected files copied to %s\n' "$pre"
