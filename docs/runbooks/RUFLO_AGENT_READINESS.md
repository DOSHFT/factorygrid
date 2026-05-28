# RuFlo Agent Readiness Runbook

Last verified: 2026-05-28.

## Purpose

This runbook verifies that RuFloUI tasks can complete with real execution evidence instead of model prose.

## Required Green Checks

- Fabric snapshot is green for vLLM, LiteLLM, OpenHands, RuFlo orchestrator, RuFloUI, Qdrant, and worker containers.
- `/api/swarm/status` lists Queen plus Architect, Researcher, Coder, Tester, Reviewer, and Analyst.
- LiteLLM chat completion against `qwen-coder-14b` returns a deterministic token.
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

## Smoke Commands

Model path:

```bash
curl -sS http://127.0.0.1:4001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer factory-secret-key" \
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
