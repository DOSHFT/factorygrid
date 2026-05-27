# Spec-Kit Queen Validation Runbook

Last verified: 2026-05-27.

## Purpose

This runbook verifies that a user build request can enter Spec-Kit, produce durable artifacts, and be validated by a live Queen-led RuFloUI swarm before implementation starts.

## Upstream Compatibility Rules

FactoryGrid should stay close to RuFlo/RuFloUI update paths:

- Use RuFlo concepts directly: hierarchical swarm, specialized strategy, coordinator/worker roles, shared memory, task orchestration.
- Keep local changes in RuFloUI as API/dashboard adapters, not a replacement orchestration engine.
- Spawn only agent types accepted by the installed `@claude-flow/cli`.
- Treat newer upstream-only roles as gated by runtime support. On 2026-05-27, `documenter` was rejected by the installed CLI, so Analyst handles validation/memory notes.

Relevant upstream docs reviewed:

- `https://github.com/ruvnet/ruflo/tree/main/docs`
- `docs/USERGUIDE.md`
- `docs/TEAM-GATEWAY-CHECKLIST.md`
- `docs/validation/README.md`
- `docs/federation/README.md`

## Verified Run

Spec-Kit intake run:

- run id: `20260527-spec-kit-queen-smoke-build-0a111ccb`
- request: `workspace/spec-kit/intake/20260527-spec-kit-queen-smoke-build-0a111ccb_request.md`
- spec: `workspace/spec-kit/specs/20260527-spec-kit-queen-smoke-build-0a111ccb_spec.md`
- approval checklist: `workspace/spec-kit/checklists/20260527-spec-kit-queen-smoke-build-0a111ccb_approval.md`
- Factory Brain page: `workspace/factory-brain/pages/runs/run-spec-kit-queen-smoke-build-0a111ccb.md`

Live validation task:

- task id: `task-1779871888034-2ca023`
- status: `completed`
- result marker: `QUEEN_SPEC_KIT_VALIDATION_OK`
- live agents available to the task: Queen/coordinator, Architect/architect, Researcher/researcher, Coder/coder, Tester/tester, Reviewer/reviewer, Analyst/analyst

## Commands

Build:

```bash
cd /mnt/d/UAT/factorygrid
./bin/rufloui-build.sh
```

Restart live RuFloUI after deploying touched files:

```bash
cd /home/revelation/factorygrid
docker compose restart rufloui
docker inspect factory_rufloui --format '{{.State.Health.Status}}'
```

Initialize swarm:

```powershell
$body = @{ topology='hierarchical'; maxAgents=7; strategy='specialized' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:28589/api/swarm/init' -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri 'http://127.0.0.1:28589/api/swarm/status' -Method Get
```

Acceptance signal:

- `/api/swarm/status` lists Queen plus six specialists.
- `/api/tasks/<task_id>/status` returns `completed`.
- task result includes `QUEEN_SPEC_KIT_VALIDATION_OK`.
- result lists every required Spec-Kit and Factory Brain artifact as `OK`.
