#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
BACKUP_DIR=${FACTORY_BACKUP_DIR:-/home/revelation/factorygrid_backups}
stamp=${FACTORY_BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}
name="factorygrid-${stamp}"
work="$BACKUP_DIR/$name"
archive="$BACKUP_DIR/${name}.tar.gz"

mkdir -p "$work"/{config,state,qdrant,neo4j,logs,runtime}
cd "$ROOT"

write_manifest() {
  cat > "$work/MANIFEST.txt" <<EOF
name=$name
created_utc=$stamp
root=$ROOT
host=$(hostname)
git_head=$(git rev-parse HEAD 2>/dev/null || printf unknown)
git_status=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
docker_compose_services=$(docker compose config --services 2>/dev/null | tr '\n' ',' | sed 's/,$//')
qdrant_snapshot=best-effort-api
neo4j_backup=filesystem-copy-best-effort
restore_default=dry-run
EOF
}

copy_if_exists() {
  local src=$1 dst=$2
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp -a "$src" "$dst"
  fi
}

copy_tree_filtered() {
  local src=$1 dst=$2
  [ -d "$src" ] || return 0
  mkdir -p "$dst"
  local secret_excludes=()
  if [ "${FACTORY_BACKUP_INCLUDE_SECRETS:-no}" != "yes" ]; then
    secret_excludes=(
      --exclude='./.jwt_secret'
      --exclude='./secrets.json'
      --exclude='./settings.json'
      --exclude='./settings.json.bak*'
      --exclude='./*.key'
      --exclude='./*.pem'
      --exclude='./*.token'
    )
  fi
  tar -C "$src" \
    --ignore-failed-read \
    "${secret_excludes[@]}" \
    --exclude='./node_modules' \
    --exclude='./.git' \
    --exclude='./.rufloui/*.json' \
    --exclude='./.claude-flow/plugins/node_modules' \
    --exclude='./.claude-flow/cache' \
    --exclude='./logs/*.log' \
    --exclude='./*.pid' \
    -cf - . | tar -C "$dst" -xf -
}

write_manifest

copy_if_exists docker-compose.yml "$work/config/docker-compose.yml"
copy_if_exists litellm_config.yaml "$work/config/litellm_config.yaml"
copy_if_exists .env.example "$work/config/.env.example"
if [ "${FACTORY_BACKUP_INCLUDE_SECRETS:-no}" = "yes" ]; then
  copy_if_exists .env "$work/config/.env"
else
  printf '.env intentionally excluded. Set FACTORY_BACKUP_INCLUDE_SECRETS=yes for an encrypted/offline secrets backup.\n' > "$work/config/SECRETS_EXCLUDED.txt"
fi
copy_if_exists README.md "$work/config/README.md"
copy_if_exists todo-factory.md "$work/config/todo-factory.md"
copy_if_exists runtime "$work/runtime/runtime"
copy_if_exists bin/factory-doctor.sh "$work/runtime/bin/factory-doctor.sh"
copy_if_exists bin/factory-model-start.sh "$work/runtime/bin/factory-model-start.sh"
copy_if_exists bin/factory-model-stop.sh "$work/runtime/bin/factory-model-stop.sh"
copy_if_exists bin/factory-model-status.sh "$work/runtime/bin/factory-model-status.sh"
copy_if_exists bin/start-vllm-factory.sh "$work/runtime/bin/start-vllm-factory.sh"
copy_if_exists bin/stop-vllm-factory.sh "$work/runtime/bin/stop-vllm-factory.sh"
copy_tree_filtered ruflo_project "$work/state/ruflo_project"
copy_tree_filtered rufloui/.rufloui "$work/state/rufloui-persist"
copy_tree_filtered openhands_state "$work/state/openhands_state"
copy_tree_filtered logs/openhands "$work/logs/openhands"

find "$work" -type d -name node_modules -prune -exec rm -rf {} + 2>/dev/null || true
find "$work" -type d -name .git -prune -exec rm -rf {} + 2>/dev/null || true
find "$work" -type f \( -name '*.log' -o -name '*.pid' \) -delete 2>/dev/null || true

if curl -fsS --max-time 5 http://127.0.0.1:6333/collections > "$work/qdrant/collections.json" 2>"$work/qdrant/error.log"; then
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$work/qdrant/collections.json" "$work/qdrant" <<'PY'
import json, pathlib, sys, urllib.request
collections = json.load(open(sys.argv[1], encoding="utf-8")).get("result", {}).get("collections", [])
out = pathlib.Path(sys.argv[2])
for item in collections:
    name = item.get("name")
    if not name:
        continue
    req = urllib.request.Request(f"http://127.0.0.1:6333/collections/{name}/snapshots", method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    (out / f"{name}.snapshot.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    snap_name = data.get("result", {}).get("name")
    if snap_name:
        url = f"http://127.0.0.1:6333/collections/{name}/snapshots/{snap_name}"
        urllib.request.urlretrieve(url, out / snap_name)
PY
  fi
else
  printf 'Qdrant API unavailable; qdrant_storage is not copied live by default.\n' > "$work/qdrant/README.txt"
fi

if docker compose ps neo4j --format '{{.State}}' 2>/dev/null | grep -qi running; then
  printf 'Neo4j is running. Community Edition online dump is not safe; backup records config and requires offline restore plan.\n' > "$work/neo4j/README.txt"
elif [ -d qdrant_storage ]; then
  copy_if_exists qdrant_storage "$work/qdrant/qdrant_storage"
fi

(cd "$work" && find . -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "$BACKUP_DIR" -czf "$archive" "$name"
sha256sum "$archive" > "${archive}.sha256"
rm -rf "$work"
printf '%s\n' "$archive"
