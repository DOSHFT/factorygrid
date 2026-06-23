#!/usr/bin/env bash
set -euo pipefail

target="${1:-.}"
shift || true

cd "$target"

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "Locked npm install requires package.json and package-lock.json in $PWD" >&2
  exit 64
fi

hash_file="node_modules/.factory-lock.sha256"
current_hash="$(sha256sum package.json package-lock.json | sha256sum | awk '{print $1}')"
stored_hash=""
if [[ -f "$hash_file" ]]; then
  stored_hash="$(cat "$hash_file" 2>/dev/null || true)"
fi

if [[ -d node_modules && "$stored_hash" == "$current_hash" ]]; then
  echo "npm dependencies already match package-lock.json in $PWD"
  exit 0
fi

echo "Installing locked npm dependencies in $PWD"
npm ci "$@"
mkdir -p node_modules
printf '%s\n' "$current_hash" > "$hash_file"
