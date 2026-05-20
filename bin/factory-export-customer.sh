#!/usr/bin/env bash
set -euo pipefail
ROOT=${FACTORYGRID_ROOT:-/home/revelation/factorygrid}
UAT_COPY=${UAT_COPY:-/mnt/d/UAT/factorygrid}
OUT_DIR=${1:-/mnt/d/UAT/releases}
STAMP=${STAMP:-$(date +%Y%m%d-%H%M%S)}
NAME="factorygrid-customer-${STAMP}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"
cd "$ROOT"
"$ROOT/server/hooks/gate_export_coverage.py"
"$ROOT/bin/factory-uat-copy.sh" "$UAT_COPY"
PKG="$WORK/$NAME"
mkdir -p "$PKG/factorygrid"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='_restore/' \
  "$UAT_COPY/" "$PKG/factorygrid/"
cat > "$PKG/install-factorygrid.sh" <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
TARGET=${TARGET:-$HOME/factorygrid}
START=0
SKIP_DEPS=0
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    --start) START=1; shift ;;
    --skip-deps) SKIP_DEPS=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help)
      cat <<HELP
FactoryGrid customer installer

Usage:
  ./install-factorygrid.sh [--target /home/user/factorygrid] [--skip-deps] [--start] [--force]

Defaults:
  target: $HOME/factorygrid
  dependencies: install npm packages when npm is available
  start: off unless --start is passed
HELP
      exit 0 ;;
    *) echo "[INSTALL][FAIL] unknown arg: $1" >&2; exit 2 ;;
  esac
done
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/factorygrid"
if [ ! -d "$SRC_DIR" ]; then
  echo "[INSTALL][FAIL] package payload missing: $SRC_DIR" >&2
  exit 2
fi
case "$(uname -s)" in
  Linux) ;;
  *) echo "[INSTALL][WARN] expected Linux/WSL target, got $(uname -s)" ;;
esac
mkdir -p "$(dirname "$TARGET")"
if [ -e "$TARGET" ] && [ "$FORCE" -ne 1 ]; then
  BACKUP="${TARGET}.bak.$(date +%Y%m%d-%H%M%S)"
  mv "$TARGET" "$BACKUP"
  echo "[INSTALL][BACKUP] existing target moved to $BACKUP"
fi
mkdir -p "$TARGET"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC_DIR/" "$TARGET/"
else
  (cd "$SRC_DIR" && tar cf - .) | (cd "$TARGET" && tar xf -)
fi
find "$TARGET/bin" -maxdepth 1 -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
find "$TARGET/server/hooks" -maxdepth 1 -type f -exec chmod +x {} + 2>/dev/null || true
find "$TARGET/FIXReaper/bin" -maxdepth 1 -type f -exec chmod +x {} + 2>/dev/null || true
if [ ! -f "$TARGET/.env" ] && [ -f "$TARGET/.env.example" ]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  echo "[INSTALL][ENV] created $TARGET/.env from template; edit before production use"
fi
if [ "$SKIP_DEPS" -ne 1 ]; then
  if command -v npm >/dev/null 2>&1; then
    [ -f "$TARGET/ruflo_project/package.json" ] && npm --prefix "$TARGET/ruflo_project" install
    [ -f "$TARGET/rufloui/package.json" ] && npm --prefix "$TARGET/rufloui" install --legacy-peer-deps
  else
    echo "[INSTALL][WARN] npm not found; dependency install skipped"
  fi
else
  echo "[INSTALL][SKIP] dependency install skipped"
fi
if [ "$START" -eq 1 ]; then
  if command -v docker >/dev/null 2>&1; then
    (cd "$TARGET" && docker compose up -d)
    [ -x "$TARGET/bin/factory-doctor.sh" ] && (cd "$TARGET" && ./bin/factory-doctor.sh)
  else
    echo "[INSTALL][WARN] docker not found; start skipped"
  fi
fi
cat <<DONE
[INSTALL][PASS] FactoryGrid installed at $TARGET

Next commands:
  cd "$TARGET"
  nano .env
  npm --prefix ruflo_project install
  npm --prefix rufloui install --legacy-peer-deps
  docker compose up -d
  ./bin/factory-doctor.sh

Primary UI after start:
  http://localhost:28588/factory
DONE
INSTALL
chmod +x "$PKG/install-factorygrid.sh"
cat > "$PKG/README_CUSTOMER_INSTALL.md" <<README
# FactoryGrid Customer Install

Fast path on the destination WSL Ubuntu box:

\`\`\`bash
chmod +x install-factorygrid.sh
./install-factorygrid.sh --target \$HOME/factorygrid
\`\`\`

Self-extracting artifact path:

\`\`\`bash
chmod +x ${NAME}.run
./${NAME}.run --target \$HOME/factorygrid
\`\`\`

Start after install:

\`\`\`bash
cd \$HOME/factorygrid
nano .env
docker compose up -d
./bin/factory-doctor.sh
\`\`\`
README
TAR="$OUT_DIR/${NAME}.tar.gz"
RUN="$OUT_DIR/${NAME}.run"
tar -C "$WORK" -czf "$TAR" "$NAME"
cat > "$RUN" <<RUNNER
#!/usr/bin/env bash
set -euo pipefail
TMP=\$(mktemp -d)
trap 'rm -rf "\$TMP"' EXIT
ARCHIVE_LINE=__ARCHIVE_BELOW__
tail -n +\$((ARCHIVE_LINE + 1)) "\$0" | tar -xz -C "\$TMP"
exec "\$TMP/${NAME}/install-factorygrid.sh" "\$@"
exit 0
__ARCHIVE_BELOW__
RUNNER
sed -i "s/^ARCHIVE_LINE=.*/ARCHIVE_LINE=$(grep -n '^__ARCHIVE_BELOW__$' "$RUN" | cut -d: -f1)/" "$RUN"
cat "$TAR" >> "$RUN"
chmod +x "$RUN"
sha256sum "$TAR" "$RUN" > "$OUT_DIR/${NAME}.sha256"
cat > "$OUT_DIR/${NAME}.manifest.txt" <<MANIFEST
name=$NAME
created_at=$(date -Is)
source=$ROOT
uat_copy=$UAT_COPY
tar=$TAR
run=$RUN
git_head=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)
MANIFEST
printf '[EXPORT][PASS] tar=%s\n[EXPORT][PASS] run=%s\n[EXPORT][PASS] sha256=%s\n' "$TAR" "$RUN" "$OUT_DIR/${NAME}.sha256"
