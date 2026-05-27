# Revelation Factory Agent Capability Matrix

Date: 2026-05-18

## Policy

This is a development factory. Agents operate in YOLO mode after a DR snapshot exists for the run. YOLO does not mean unbounded writes. It means no per-step approval inside declared boundaries.

## Agent Capabilities

| Agent | Primary Role | Allowed Capabilities | Blocked Capabilities | Required Input | Required Output |
| --- | --- | --- | --- | --- | --- |
| Queen | State-machine orchestration | create run id, trigger snapshot, route stages, enforce gates | direct code writes, bypassing failed gates | user request | `workspace/manifests/<run_id>_task_manifest.json` |
| Researcher | Current-source evidence | Tavily, Firecrawl when configured, source manifests, summaries | uncited claims, raw page dumps into prompt | manifest | research brief and source manifest |
| Architect | Workspace topology and interfaces | shallow reads, blueprint generation, allowed path definition | deep broad scans, write operations | research brief | architecture blueprint |
| Coder | Scoped implementation | write only allowed paths, local tests, small diffs | protected file edits unless `infrastructure_run=true`, broad refactors | architecture blueprint | code diff |
| Tester | Runtime validation | run commands, capture exit codes, stack traces | guessed results, success claims without output | code diff and blueprint | validation report |
| Reviewer | Safety and compliance | diff review, CodeRabbit when available, static/security review | approving out-of-scope diffs, ignoring failed tests | blueprint and validation report | review log |
| Documenter | Durable memory and handoff | handoff docs, changelog updates, memory prep | raw secret/log ingestion, vague summaries | review log | handoff summary |
| MemoryReader | Evidence retrieval | Graphiti/Qdrant/Factory Brain lookup, evidence-chain summaries | uncited recall, mixing superseded facts silently | operator request or task context | evidence chain + stale-memory warnings |
| MemoryWriter | Provenance-rich memory write | Graphiti episode write, Qdrant/file fallback, source hash capture | raw secret/log ingestion, untraceable summaries | accepted artifact or handoff summary | memory id + source path + content hash |
| MemoryChecker | SAGE-style validation | contradiction detection, repair-task creation, superseded/invalidated relation requests | deleting old memory, unreviewed automatic truth replacement | task result + validation/review artifacts | contradiction report + repair tasks |

## Live Swarm Validation

Last verified: 2026-05-27.

RuFloUI task `task-1779871888034-2ca023` completed with `QUEEN_SPEC_KIT_VALIDATION_OK` after the Queen-led swarm validated Spec-Kit intake artifacts for run `20260527-spec-kit-queen-smoke-build-0a111ccb`.

The live swarm roster available to the task was:

- Queen/coordinator
- Architect/architect
- Researcher/researcher
- Coder/coder
- Tester/tester
- Reviewer/reviewer
- Analyst/analyst

Registry bug fixed during this validation: agents spawned within the same second were previously keyed by display time, causing most specialists to be overwritten. The registry now keys API-spawned agents by stable agent id.

## Protected Paths

These require explicit `infrastructure_run=true` in the architecture blueprint:

- `.env`
- `docker-compose.yml`
- `litellm_config.yaml`
- `openhands_state/settings.json`
- `bin/start-vllm-factory.sh`
- dependency manifests and lockfiles
- model launchers
- credentials and secret stores

## Gate Chain

```text
pre_work_snapshot.sh
  -> Researcher
  -> Architect
  -> gate_architecture.py
  -> Coder
  -> gate_diff_scope.py
  -> Tester
  -> gate_validation.py
  -> Reviewer
  -> gate_review.py
  -> Documenter
```

## Runtime Notes

- Stable model: `qwen-coder-14b` through LiteLLM.
- Context cap: 32k.
- Parallel vLLM sequences: 4.
- OpenHands correction loop guard: 40 max iterations, 3 factory correction cycles.

| Blue-Team-CELL | Defensive cellular security research | lab-only 2G-6G/O-RAN threat modeling, source ingestion, control matrices, validation plans | live-network interception, jamming, rogue base stations, subscriber capture, unauthorized RF activity | source manifest + operator request | cellular blue-team brief + lab plan |
