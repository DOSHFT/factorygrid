#!/usr/bin/env bash
set -euo pipefail

ROOT=${FACTORYGRID_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
REPORT_DIR="$ROOT/workspace/reports/self-tests"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
REPORT="$REPORT_DIR/$STAMP-factorygrid-self-test.md"

mkdir -p "$REPORT_DIR"

status="PASS"
failures=0
mark_fail() { status="FAIL"; failures=$((failures + 1)); }
append() { printf '%s\n' "$*" >>"$REPORT"; }
capture() {
  local title="$1"
  shift
  append "## $title"
  append '```'
  if "$@" >>"$REPORT" 2>&1; then
    append '```'
    append ''
    return 0
  fi
  local code=$?
  append '```'
  append ''
  return "$code"
}

cat >"$REPORT" <<EOF
# FactoryGrid Self-Test

Generated: $STAMP
Factory root: $ROOT

EOF

capture "Container Health" bash -lc "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'factory_(rufloui|litellm|ruflo|qdrant)|agent_openhands|agent_qwen_code'" || mark_fail
capture "GPU And Loaded Model" bash -lc "curl -fsS http://127.0.0.1:18000/v1/models && printf '\n' && nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits" || mark_fail
capture "LiteLLM Alias" docker exec -i factory_litellm python3 - <<'PY' || mark_fail
import json, urllib.request
body = json.dumps({
  "model": "qwen-coder-14b",
  "messages": [{"role": "user", "content": "Reply exactly SELF_TEST_LITELLM_OK"}],
  "max_tokens": 10,
  "temperature": 0
}).encode()
req = urllib.request.Request("http://127.0.0.1:4000/v1/chat/completions", data=body, headers={"content-type": "application/json"})
with urllib.request.urlopen(req, timeout=120) as response:
    data = json.loads(response.read().decode())
text = data["choices"][0]["message"]["content"]
assert "SELF_TEST_LITELLM_OK" in text, text
print("SELF_TEST_LITELLM_OK")
PY
capture "RuFloUI API Health" bash -lc "curl -fsS http://127.0.0.1:28580/api/system/info && printf '\n' && curl -fsS http://127.0.0.1:28580/api/tasks/summary" || mark_fail
capture "RuFloUI Feature Endpoint Sweep" bash -lc '
set -e
for path in \
  /api/system/health \
  /api/system/preflight \
  /api/system/info \
  /api/system/factory-runtime \
  /api/system/protected-files \
  /api/swarm/status \
  /api/swarm/health \
  /api/agents \
  /api/agents/pool \
  /api/tasks/summary \
  /api/tasks \
  /api/memory/stats \
  /api/memory \
  /api/sessions \
  /api/hive-mind/status \
  /api/hive-mind/memory \
  /api/neural/status \
  /api/neural/patterns \
  /api/neural/metrics \
  /api/performance/metrics \
  /api/performance/bottleneck \
  /api/performance/profile \
  /api/performance/report \
  /api/hooks \
  /api/hooks/metrics \
  /api/workflows/templates \
  /api/workflows \
  /api/coordination/metrics \
  /api/coordination/topology \
  /api/config \
  /api/config/server-settings \
  /api/config/telegram \
  /api/ai-defence/scan \
  /api/ai-defence/stats \
  /api/swarm-monitor/snapshot \
  /api/swarm-monitor/activity \
  /api/swarm-monitor/agents \
  /api/swarm-monitor/health \
  /api/swarm-monitor/metrics \
  /api/workspace/status \
  /api/workspace/diff \
  /api/viz/sessions; do
    code=$(curl -sS -o /tmp/self-test-endpoint.out -w "%{http_code}" "http://127.0.0.1:28580$path")
    if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
      echo "FAIL $code $path"
      cat /tmp/self-test-endpoint.out
      exit 1
    fi
    echo "OK $code $path"
  done
' || mark_fail
if [ -x "$ROOT/bin/factory-action-self-test.sh" ]; then
  capture "Factory Action Self-Test" "$ROOT/bin/factory-action-self-test.sh" || mark_fail
else
  append "## Factory Action Self-Test"
  append '```'
  append "action self-test unavailable at $ROOT/bin/factory-action-self-test.sh"
  append '```'
  append ''
  mark_fail
fi
if [ -x /mnt/d/Dev/Projects/_revelation-stack/scripts/revelation-stack-doctor.sh ]; then
  capture "Full Factory Pipeline Doctor" /mnt/d/Dev/Projects/_revelation-stack/scripts/revelation-stack-doctor.sh --check || mark_fail
else
  append "## Full Factory Pipeline Doctor"
  append '```'
  append "doctor script unavailable at /mnt/d/Dev/Projects/_revelation-stack/scripts/revelation-stack-doctor.sh"
  append '```'
  append ''
  mark_fail
fi

append "## Summary"
append ""
append "- Status: $status"
append "- Failures: $failures"
append "- Report: $REPORT"

summary="FactoryGrid self-test $status. Failures: $failures. Report: $REPORT"
task_json=$(curl -fsS -X POST http://127.0.0.1:28580/api/tasks \
  -H 'content-type: application/json' \
  -d "{\"title\":\"FactoryGrid self-test $STAMP\",\"description\":\"Deterministic self-test report: $REPORT\",\"priority\":\"high\",\"cwd\":\"/factorygrid\"}")
task_id=$(printf '%s' "$task_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -fsS -X POST "http://127.0.0.1:28580/api/tasks/$task_id/complete" \
  -H 'content-type: application/json' \
  -d "{\"result\":\"$summary\"}" >/dev/null

append ""
append "## RuFloUI Report-In"
append ""
append "- Task ID: $task_id"
append "- Task result: $summary"

printf '%s\n' "$summary"
printf 'task_id=%s\n' "$task_id"
printf 'report=%s\n' "$REPORT"

if [ "$status" != "PASS" ]; then
  exit 1
fi
