# RuFlo Agent Readiness Runbook

Last verified: 2026-05-29.

## Purpose

This runbook verifies that RuFloUI tasks can complete with real execution evidence instead of model prose.

## Required Green Checks

- Fabric snapshot is green for vLLM, LiteLLM, Hermes Dashboard, OpenHands, RuFlo orchestrator, RuFloUI, Qdrant, and worker containers.
- Dashboard health reasons are visible when any normalized check is warn/fail. Non-blocking RuFlo doctor notes remain visible in API output but do not degrade FactoryGrid production status.
- Task board has no failed/cancelled tasks after stale failure cleanup; completed task evidence is preserved unless explicitly cleaned from the Completed column.
- `/api/swarm/status` lists Queen plus Architect, Researcher, Coder, Tester, Reviewer, and Analyst.
- LiteLLM chat completion against `qwen-coder-14b` returns a deterministic token.
- Decima Hermes uses LiteLLM at `http://172.20.86.232:4001/v1` with stable alias `qwen-coder-14b`; model switches create a Hermes model-sync work order.
- Spec-Kit intake creates request, spec, checklist, and Factory Brain run artifacts.
- Queen validates those Spec-Kit artifacts before implementation smoke.
- Exact-reply task completes with the exact requested token.
- Workspace file-write task tied to the Spec-Kit run creates the requested file, reads it back, and returns `AGENT_WRITE_READY_OK`.
- The requested filename, including extensions such as `.txt`, must match the file created on disk.

## Production Executor Rules

RuFloUI uses bounded deterministic execution for readiness-class tasks:

- exact reply tasks do not enter the LLM planner,
- workspace file-write tasks are allowed only under `/factorygrid/workspace/`,
- file writes include Queen boundary, Coder write, Tester readback, and Reviewer scope workflow steps,
- protected files remain blocked unless an approved architecture gate explicitly allows them.

This avoids false positives where a local model explains how it would use tools but does not actually execute them.

## Task Board Cleanup

Use the column-specific cleanup endpoint for stale terminal tasks:

```bash
curl -sS -X POST http://127.0.0.1:28589/api/tasks/clean-terminal \
  -H "Content-Type: application/json" \
  -d '{"statuses":["failed","cancelled"]}'
```

This removes only failed/cancelled tasks. It does not remove completed evidence. The Tasks UI Clean button now follows the selected column:

- Completed column: deletes completed tasks only.
- Failed / Cancelled column: deletes failed and cancelled tasks only.

## Workspace Drill-Down

Created/untracked files now return an explanatory diff preview from `/api/workspace/diff` instead of a blank panel. For a new file, the response starts with:

```text
Created file: <path>
--- /dev/null
+++ b/<path>
@@
+<content preview>
```

For a new directory, the response states that Git does not provide a file diff for untracked directories and tells the operator to expand the tree.

## Smoke Commands

Model path:

```bash
curl -sS http://127.0.0.1:4001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FACTORY_API_KEY" \
  -d '{"model":"qwen-coder-14b","messages":[{"role":"user","content":"Reply exactly READY_OK"}],"max_tokens":8,"temperature":0}'
```

Spec-Kit intake:

```powershell
$body = @{
  title = "RuFlo agent readiness smoke"
  vision = "Verify that FactoryGrid can turn operator intent into Spec-Kit artifacts, validate them through Queen, and complete a bounded workspace write task."
  successCriteria = "Request/spec/checklist/brain artifacts exist; Queen validation completes; workspace write task returns AGENT_WRITE_READY_OK."
  cautions = "Do not touch protected files or production configuration."
  requestedMode = "PLAN"
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:28589/api/factory/intake' -Method Post -ContentType 'application/json' -Body $body
```

Queen Spec-Kit validation task:

```powershell
$desc = @"
QUEEN SPEC-KIT VALIDATION
Validate the generated readiness artifacts:
workspace/spec-kit/intake/<run_id>_request.md
workspace/spec-kit/specs/<run_id>_spec.md
workspace/spec-kit/checklists/<run_id>_approval.md
workspace/factory-brain/pages/runs/run-<short_id>.md
"@
$body = @{ title="Queen Spec-Kit readiness validation"; description=$desc; priority="critical"; cwd="/factorygrid"; assignTo="swarm" } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:28589/api/tasks' -Method Post -ContentType 'application/json' -Body $body
```

Task write smoke:

```powershell
$stamp = Get-Date -Format 'yyyyMMddTHHmmss'
$path = "/factorygrid/workspace/tmp/ruflo-agent-ready-$stamp.txt"
$body = @{
  title = "Agent readiness write smoke $stamp"
  description = "Using the approved Spec-Kit readiness run as context, create the file $path containing exactly RUFLO_AGENT_READY_$stamp. Then read it back and report AGENT_WRITE_READY_OK if the content matches. Do not modify any other file."
  priority = "critical"
  cwd = "/factorygrid"
  assignTo = "swarm"
} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:28589/api/tasks' -Method Post -ContentType 'application/json' -Body $body
```

Expected task result starts with:

```text
AGENT_WRITE_READY_OK
```

## Verified 2026-05-28 Run

- Spec-Kit run id: `20260528-ruflo-agent-readiness-smoke-9f4b4dd8`
- Queen validation task: `task-1779997345059-cbe144`
- Queen validation result: `QUEEN_SPEC_KIT_VALIDATION_OK`
- Workspace write task: `task-1779997547899-677e39`
- Workspace write result: `AGENT_WRITE_READY_OK`
- Verified file: `workspace/tmp/ruflo-agent-ready-spec-kit-20260528T214546.txt`
- Verified content: `RUFLO_AGENT_READY_20260528T214546`
- Swarm roster: Queen/coordinator, Architect/architect, Researcher/researcher, Coder/coder, Tester/tester, Reviewer/reviewer, Analyst/analyst

## Verified 2026-05-29 Run

- Stale failed tasks removed: `task-1779854805974`, `task-update-20260527`
- Task summary after cleanup: 25 completed, 0 pending, 0 in progress, 0 failed
- Spec-Kit run id: `20260528-ruflo-production-readiness-smoke-20260528t220603z-7f29df0d`
- Queen validation task: `task-1780005963367-5926b0`
- Queen validation result: `QUEEN_SPEC_KIT_VALIDATION_OK`
- Workspace write task: `task-1780005963376-311243`
- Workspace write result: `AGENT_WRITE_READY_OK`
- Exact reply task: `task-1780005963385-c9b14c`
- Exact reply result: `RUFLO_REAL_TASK_OK`
- Verified file: `workspace/tmp/ruflo-real-ready-20260528T220603Z.txt`
- Verified content from host and container: `RUFLO_REAL_READY_20260528T220603Z`
- Fabric snapshot after validation: 10 green, 0 yellow, 0 red
- Task summary after validation: 28 completed, 0 pending, 0 in progress, 0 failed
