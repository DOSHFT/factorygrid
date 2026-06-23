# Revelation Factory Agent Capability Matrix

Last verified: 2026-06-06

## Runtime Policy

FactoryGrid is a local development factory. Agents may run in YOLO mode only inside declared run boundaries after a DR snapshot exists. YOLO means no per-step approval; it does not mean unbounded writes, secret access, production network actions, or bypassing gates.

The current execution split is:

| Runtime | Live Responsibility |
| --- | --- |
| WSL `Revelation` | RuFlo, RuFloUI, vLLM, LiteLLM, Qdrant, Neo4j, OpenHands, Qwen worker, Factory Brain |
| WSL `decima-intelligence-it` | Hermes dashboard/chat, Hermes CLI, claude-code CLI, research sidecar, ttyd consoles |
| Windows host | `D:\Hermes-Desktop`, browser/operator access, Git/PowerShell, LAN portproxy |

## Live Agent Capabilities

These are configured in `ruflo_project/ruflo.config.js` with `maxAgents: 11`.

| Agent | Primary Role | Allowed Capabilities | Blocked Capabilities | Required Input | Required Output |
| --- | --- | --- | --- | --- | --- |
| Queen | State-machine orchestration | create run id, trigger snapshot, route stages, enforce gates, require export coverage for UAT/PROD updates | direct code writes, bypassing failed gates, unbounded task spawning | user request | task manifest, state transitions, task graph |
| Architect | System design | shallow workspace mapping, interface design, allowed write path definition, protected-file detection | broad repo dumps, write operations, unapproved dependency/config edits | research brief + constraints | `architecture_blueprint.json` |
| Researcher | Current-source evidence | Tavily search, source manifests, freshness checks, provenance summaries | uncited claims, raw page dumps into prompts, credentialed scraping without scope | manifest or operator request | `research_brief.md`, `source_manifest.json` |
| Coder | Scoped implementation | edit allowed paths, follow local patterns, keep diffs attributable, run local commands | protected file edits unless `infrastructure_run=true`, broad refactors, secret ingestion | approved blueprint | bounded diff |
| Tester | Runtime validation | run declared commands, capture exit codes, stack traces, endpoint probes | guessed results, stale test output, success claims without command evidence | diff + blueprint | `validation_report.md` |
| Reviewer | Safety and code review | diff review, scope review, security/performance/missing-test review | approving out-of-scope diffs, ignoring failed tests, normalizing unsafe autonomy | blueprint + validation report | `review_log.json` |
| Documenter | Durable documentation | handoff summaries, run pages, docs/runbook updates, memory-ready summaries | raw secret/log ingestion, vague summaries, untraceable memory writes | review log + artifacts | `handoff_summary.md`, Factory Brain updates |
| Technology-Strategist | Adversarial technology selection | compare stacks, document reversal triggers, block weak technology choices | rubber-stamping preferred tools, unresearched dependency choices | goal + constraints | technology decision note |
| GitHub-Risk-Scout | Upstream failure intelligence | mine upstream docs/issues/releases for setup/protocol/performance risks | relying on stale recalled package behavior, uncited upstream claims | dependency or integration target | risk brief + source manifest |
| Performance-Engineer | Latency and throughput validation | define p50/p95/p99, throughput, allocation, backpressure, soak requirements | accepting functional-only validation for performance-sensitive work | architecture + target SLOs | performance profile + validation plan |
| Blue-Team-CELL | Defensive cellular security research | lab-only 2G-6G/O-RAN threat modeling, detection/control matrices, validation plans | live-network interception, jamming, rogue base stations, subscriber capture, unauthorized RF activity | source manifest + operator request | cellular blue-team brief + lab plan |

## Memory Roles

MemoryReader, MemoryWriter, and MemoryChecker are design responsibilities, not currently separate healthy production containers. Their live behavior is implemented through:

- Factory Brain markdown under `workspace/factory-brain/pages`.
- Qdrant collections including `factory_context_index`, `factory_research_sources`, and `factory_run_artifacts`.
- Documenter/Queen-managed run pages and handoff summaries.
- Neo4j as a shadow graph only; it is running but currently reports unhealthy.

Do not document MemoryReader/Writer/Checker as live services until their endpoints and health checks are green.

## Live Runtime Validation

Verified on 2026-06-06:

- Native vLLM serves `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` on `Revelation:18000`.
- LiteLLM exposes `qwen-coder-14b`, `qwen-coder-14b-anthropic`, `mode-a-research`, and `local-qwen`.
- `factory_ruflo` runs RuFlo `3.7.0-alpha.44` and exposes MCP on host port `3011`.
- `factory_rufloui` exposes API `28580` and frontend `28589`.
- `factory_qdrant`, `factory_litellm`, `factory_ruflo`, `factory_rufloui`, and `agent_openhands` are healthy.
- `factory_neo4j` is running but unhealthy; graph memory remains non-authoritative.
- Decima Hermes dashboard runs on `http://172.20.86.232:9119/`.
- Decima claude-code and Hermes shells are exposed on ttyd ports `7682` and `7681`.

## Protected Paths

These require explicit `infrastructure_run=true` in the architecture blueprint:

- `.env`
- `docker-compose.yml`
- `litellm_config.yaml`
- `openhands_state/settings.json`
- `bin/start-vllm-factory.sh`
- `bin/restart-vllm-factory.sh`
- `runtime/vllm-model.env`
- dependency manifests and lockfiles
- model launchers
- credentials and secret stores
- Windows portproxy scripts
- Decima Hermes launchers

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
  -> gate_export_coverage.py when UAT/PROD/runtime contracts change
```

## Runtime Notes

- Default model alias for factory work: `qwen-coder-14b`.
- Default research/Hermes/claude-code alias: `mode-a-research`.
- Context cap: 32k.
- Parallel vLLM sequences: 4.
- OpenHands correction loop guard: 40 max iterations.
- Factory correction cycles: 3.
- Decima is the only Hermes runtime documented for the dashboard URL; do not attach Hermes to Revelation port-forward status.
