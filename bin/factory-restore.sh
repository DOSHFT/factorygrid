#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  printf 'Usage: %s /path/to/factorygrid-YYYYmmdd-HHMMSS.tar\n' "$0" >&2
  exit 2
fi

archive=$1
ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
parent=$(dirname "$ROOT")

if [ ! -f "$archive" ]; then
  printf 'Archive not found: %s\n' "$archive" >&2
  exit 1
fi

if [ -f "${archive}.sha256" ]; then
  sha256sum -c "${archive}.sha256"
fi

stamp=$(date +%Y%m%d-%H%M%S)
if [ -d "$ROOT" ]; then
  mv "$ROOT" "${ROOT}.pre-restore-${stamp}"
fi

tar -xf "$archive" -C "$parent"
printf 'Restored to %s\n' "$ROOT"

