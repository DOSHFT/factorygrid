#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
THRESHOLD_MB=${VRAM_ALERT_MB:-21500}
RAM_ALERT_PCT=${RAM_ALERT_PCT:-90}
LOG_FILE=${VRAM_LOG_FILE:-"$ROOT/logs/vram_telemetry.log"}
INTERVAL=${VRAM_INTERVAL_SECONDS:-2}

mkdir -p "$(dirname "$LOG_FILE")"

printf 'FactoryGrid VRAM/RAM telemetry active\n'
printf 'VRAM alert threshold: %s MB\n' "$THRESHOLD_MB"
printf 'RAM alert threshold: %s%%\n' "$RAM_ALERT_PCT"
printf 'Log: %s\n' "$LOG_FILE"

while true; do
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  if command -v nvidia-smi >/dev/null 2>&1; then
    vram_used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -n 1 | tr -d ' ')
  else
    vram_used=0
  fi
  ram_pct=$(free | awk '/^Mem:/ {printf "%d", ($3 / $2) * 100}')
  printf '[%s] vram_used_mb=%s ram_used_pct=%s\n' "$timestamp" "$vram_used" "$ram_pct" >> "$LOG_FILE"

  if [ "$vram_used" -gt "$THRESHOLD_MB" ]; then
    printf '\n[CRITICAL] VRAM alert: %s MB used, threshold %s MB. Pause new agent runs.\n' "$vram_used" "$THRESHOLD_MB"
  fi
  if [ "$ram_pct" -gt "$RAM_ALERT_PCT" ]; then
    printf '\n[CRITICAL] RAM alert: %s%% used, threshold %s%%. Pause new agent runs.\n' "$ram_pct" "$RAM_ALERT_PCT"
  fi

  printf '\r[Telemetry] VRAM %s MB | RAM %s%%   ' "$vram_used" "$ram_pct"
  sleep "$INTERVAL"
done

