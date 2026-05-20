#!/usr/bin/env bash
set -euo pipefail
SRC=${SRC:-/home/revelation/factorygrid}
DEST=${1:-/mnt/d/UAT/factorygrid}
STAMP=$(date +%Y%m%d-%H%M%S)
MANIFEST_DIR="$DEST/_restore"
mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ]; then
  mv "$DEST" "${DEST}.bak.${STAMP}"
fi
mkdir -p "$DEST"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='rufloui/.git/' \
  --exclude='.gitignore.bak.*' \
  --exclude='node_modules/' \
  --exclude='**/node_modules/' \
  --exclude='dist/' \
  --exclude='**/dist/' \
  --exclude='build/' \
  --exclude='**/build/' \
  --exclude='__pycache__/' \
  --exclude='**/__pycache__/' \
  --exclude='.cache/' \
  --exclude='**/.cache/' \
  --exclude='.venv/' \
  --exclude='venv/' \
  --exclude='openhands_state/' \
  --exclude='qdrant_storage/' \
  --exclude='logs/' \
  --exclude='ruflo_project/.claude-flow/daemon-state.json' \
  --exclude='ruflo_project/.claude-flow/metrics/' \
  --exclude='ruflo_project/.claude-flow/swarm/' \
  --exclude='ruflo_project/.rufloui/' \
  --exclude='ruflo_project/agentdb.rvf' \
  --exclude='ruflo_project/agentdb.rvf.lock' \
  --exclude='workspace/.openhands/' \
  --exclude='rufloui/tsconfig.tsbuildinfo' \
  --exclude='workspace/dr/' \
  --exclude='workspace/tmp/' \
  --exclude='workspace/cache/' \
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='*.sqlite' \
  --exclude='*.sqlite3' \
  --exclude='*.db' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*.p12' \
  --exclude='*.pfx' \
  --exclude='*secret*' \
  --exclude='*secrets*' \
  --exclude='*credential*' \
  --exclude='*credentials*' \
  --exclude='*.token' \
  --exclude='*.jwt' \
  --exclude='*.safetensors' \
  --exclude='*.gguf' \
  --exclude='*.pt' \
  --exclude='*.pth' \
  --exclude='*.onnx' \
  --exclude='*.bin' \
  --exclude='*.parquet' \
  --exclude='*.arrow' \
  "$SRC/" "$DEST/"
mkdir -p "$MANIFEST_DIR"
{
  echo "FactoryGrid UAT portable copy"
  echo "source=$SRC"
  echo "dest=$DEST"
  echo "created_at=$(date -Is)"
  echo "host=$(hostname)"
  echo "git_head=$(cd "$SRC" && git rev-parse HEAD 2>/dev/null || true)"
} > "$MANIFEST_DIR/MANIFEST.txt"
cat > "$DEST/RESTORE_UAT.md" <<'RESTORE'
# Restore FactoryGrid UAT Copy

Copy this folder into a fresh WSL Ubuntu box, then run:

```bash
cd factorygrid
cp .env.example .env
# edit .env with local-only secrets/endpoints
npm --prefix ruflo_project install
npm --prefix rufloui install --legacy-peer-deps
docker compose up -d
./bin/factory-doctor.sh
```

Excluded on purpose: `.env`, OpenHands secrets, Qdrant runtime storage, logs, dependency folders, build output, model blobs, and credential-bearing files.
RESTORE
printf '[UAT_COPY][PASS] %s\n' "$DEST"
