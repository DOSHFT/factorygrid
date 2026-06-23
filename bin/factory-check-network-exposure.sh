#!/usr/bin/env bash
set -euo pipefail

ROOT="${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

ALLOW_PUBLIC_PORTS="${FACTORYGRID_ALLOWED_PUBLIC_PORTS:-28589 4001}"

fail=0
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

docker compose config >"$tmp"

is_allowed_public_port() {
  local port="$1"
  for allowed in $ALLOW_PUBLIC_PORTS; do
    [ "$port" = "$allowed" ] && return 0
  done
  return 1
}

printf 'FactoryGrid network exposure policy\n'
printf 'Allowed public host ports: %s\n\n' "$ALLOW_PUBLIC_PORTS"

while IFS='|' read -r service host_ip published; do
  [ -n "$service" ] || continue
  if [ "$host_ip" = "0.0.0.0" ] || [ "$host_ip" = "::" ]; then
    if is_allowed_public_port "$published"; then
      printf '  ALLOW public %s %s:%s\n' "$service" "$host_ip" "$published"
    else
      printf '  FAIL  public %s %s:%s is not allowlisted\n' "$service" "$host_ip" "$published" >&2
      fail=1
    fi
  else
    printf '  OK    loopback %s %s:%s\n' "$service" "$host_ip" "$published"
  fi
done < <(awk '
  /^  [a-zA-Z0-9_-]+:$/ {
    service=$1
    sub(":", "", service)
    host_ip=""
    published=""
  }
  /^[[:space:]]+- mode:/ {
    host_ip=""
    published=""
  }
  /host_ip:/ {
    host_ip=$2
    gsub("\"", "", host_ip)
  }
  /published:/ {
    published=$2
    gsub("\"", "", published)
    if (host_ip != "") {
      print service "|" host_ip "|" published
    }
  }
' "$tmp")

if [ "$fail" -ne 0 ]; then
  printf '\nRefusing unapproved public bindings. Set FACTORYGRID_ALLOWED_PUBLIC_PORTS intentionally or bind the service to 127.0.0.1.\n' >&2
  exit 1
fi
