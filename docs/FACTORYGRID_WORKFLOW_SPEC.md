# FactoryGrid Workflow Spec

This is the operating contract for the Revelation local software factory.

## Runtime URLs

- vLLM model API: `http://localhost:8000/v1`
- LiteLLM gateway: `http://localhost:4000/v1`
- Qdrant: `http://localhost:6333`
- OpenHands: `http://localhost:3000`
- RuFlo MCP: `http://localhost:3010`
- RuFlo UI: `http://localhost:28580`
- RuFlo UI dev frontend: `http://localhost:28588`

## Stable Model

- Model: `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ`
- LiteLLM id: `qwen-coder-14b`
- Context: 32k
- Parallel sequences: 4
- Quantization: AWQ Marlin

Qwen3-Coder is not part of the stable path. It belongs in a separate test launcher only.

## Workflow Matrix

| Stage | Principal Agent | Input | Required Artifact | Gate |
| --- | --- | --- | --- | --- |
| Intake | Queen | rough user goal | `task_manifest.json` | goal clarity |
| Research | Researcher | manifest + constraints | `research_brief.md`, `source_manifest.json` | citations present |
| Architecture | Architect | research + workspace map | `architecture_blueprint.json` | protected paths checked |
| Production | Coder | approved blueprint | unstaged diff | write allowlist |
| Verification | Tester + Reviewer | diff + commands | `validation_report.md` | tests pass or failures documented |
| Documentation | Documenter | verified diff | `handoff_summary.md` | operator readable |

## Required Commands

```bash
cd /home/revelation/factorygrid
bin/factory-doctor.sh
docker compose config
docker compose up -d --build
bin/monitor-vram.sh
```

## Safety Gates

- Protected file changes require explicit human-visible review.
- OpenHands max iterations stay at 40 during UI/runtime prototyping.
- Long logs are streamed by run id and capped before entering model context.
- Docker socket access is treated as privileged and must be visible in UI/safety docs.
- Every run must have a run id and artifacts under `workspace/.factory-snapshots/<run_id>/`.

## Memory Contract

Qdrant records must include:

- `source_path`
- `symbol`
- `summary`
- `exact_excerpt`
- `hash`
- `language`
- `dependencies`
- `last_verified`
- `run_id`

No memory record is accepted without provenance.


## Factory Brain + Spec Kit Contract

The workflow now starts with an explicit operator intake page:

```text
http://localhost:28580/factory
```

### Artifact Phases

| Stage | Owner | Artifact | Gate |
| --- | --- | --- | --- |
| Intake | Operator + Queen | `workspace/spec-kit/intake/<run_id>_request.md` | prompt clarity and boundaries |
| Spec | Spec Kit + Queen | `workspace/spec-kit/specs/<run_id>_spec.md` | operator approval before implementation planning |
| Research | Researcher | `workspace/research/<run_id>_research_brief.md` | sources, fetch dates, evidence |
| Architecture | Architect | `workspace/architecture/<run_id>_architecture_blueprint.json` | allowed paths and protected path review |
| Tasks | Spec Kit + Queen | `workspace/spec-kit/tasks/<run_id>_tasks.md` | tasks map to spec and blueprint |
| DEV Execution | Coder | Docker-scoped workspace diff | snapshot exists before writes |
| Validation | Tester | `workspace/testing/<run_id>_validation_report.md` | real command output and exit codes |
| Review | Reviewer | `workspace/review/<run_id>_review_log.json` | diff scope, security, tests |
| Memory | Documenter | `workspace/factory-brain/pages/runs/<run_id>.md` | compiled truth plus timeline updated |

### Brain-First Rule

Before research, architecture, implementation, review, or documentation, the responsible agent must search Factory Brain and include relevant prior decisions or explicitly state that no relevant memory exists.

### Prompt Intake Requirements

Each build request should include:

- goal
- context and source links
- target repo or workspace
- hard constraints
- success criteria
- risks or caution areas
- preferred mode: `PLAN`, `DEV`, `UAT`, or `PROD`
