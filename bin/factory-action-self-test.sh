#!/usr/bin/env bash
set -euo pipefail

HOST_CONTROL_PORT="${REVELATION_HOST_CONTROL_PORT:-28579}"

echo "check: host-control health"
curl -fsS "http://127.0.0.1:$HOST_CONTROL_PORT/health"
echo

echo "check: agent growth action"
curl -fsS -X POST http://127.0.0.1:28580/api/factory/agent-growth >/tmp/factory-action-growth-start.json
for _ in $(seq 1 90); do
  curl -fsS http://127.0.0.1:28580/api/factory/agent-growth/status >/tmp/factory-action-growth-status.json
  running=$(python3 - <<'PY'
import json
print(str(json.load(open('/tmp/factory-action-growth-status.json')).get('running')).lower())
PY
)
  [ "$running" = "false" ] && break
  sleep 2
done
python3 - <<'PY'
import json
status = json.load(open('/tmp/factory-action-growth-status.json'))
assert status.get('running') is False, status
assert status.get('exitCode') == 0, status
print('AGENT_GROWTH_ACTION_OK')
PY
curl -fsS http://127.0.0.1:28580/api/factory/agent-growth/progress >/tmp/factory-action-growth-progress.json
python3 - <<'PY'
import json
progress = json.load(open('/tmp/factory-action-growth-progress.json'))
assert progress.get('score', 0) >= 100, progress
assert progress.get('qdrantPoints', 0) > 0, progress
print('AGENT_GROWTH_PROGRESS_OK')
PY

echo "check: fabric vLLM restart action"
code=$(curl -sS -o /tmp/factory-action-vllm-restart.json -w '%{http_code}' \
  -X POST http://127.0.0.1:28580/api/fabric/restart \
  -H 'content-type: application/json' \
  -d '{"target":"gpu:vllm","type":"vllm"}')
cat /tmp/factory-action-vllm-restart.json
printf '\nHTTP=%s\n' "$code"
[ "$code" -ge 200 ] && [ "$code" -lt 300 ]
python3 - <<'PY'
import json
data = json.load(open('/tmp/factory-action-vllm-restart.json'))
assert data.get('ok') is True, data
details = data.get('hostControl') or {}
assert details.get('ok') is True, data
print('FABRIC_VLLM_RESTART_ACTION_OK')
PY
for _ in $(seq 1 180); do
  if curl -fsS http://127.0.0.1:18000/v1/models >/tmp/factory-action-vllm-models.json 2>/dev/null; then
    break
  fi
  sleep 2
done
test -s /tmp/factory-action-vllm-models.json
python3 - <<'PY'
import json
models = json.load(open('/tmp/factory-action-vllm-models.json')).get('data') or []
assert models, 'no vLLM models returned'
print('VLLM_MODEL_LOADED_OK', models[0].get('id'))
PY
