# Revelation Factory TODO

Date: 2026-05-17
Target stack: `/home/revelation/factorygrid` on WSL distro `revelation`

## Top 360-Degree Weakness Checklist

- [ ] P0: Rotate the exposed Tavily key and move all secrets out of `docker-compose.yml` and committed state files into `.env` or Docker secrets.
- [x] P0: Fix WSL resource mismatch. Current live `revelation` runtime now verifies about 47 GiB RAM and 24 GiB swap via `bin/factory-doctor.sh`.
- [x] P0: Pin all mutable runtime versions. Compose now uses digest-pinned Qdrant, LiteLLM, OpenHands, Node base image defaults, pinned RuFlo version, and `bin/factory-check-runtime-pins.sh` to reject `latest` drift.
- [x] P0: Replace runtime `apt-get` / mutable `npm install` in Compose commands with built images plus a hash-gated locked bootstrap script. Runtime Node installs use `npm ci` only when `package.json` or `package-lock.json` changes.
- [ ] P0: Add healthchecks and readiness gates for vLLM, LiteLLM, Qdrant, RuFlo MCP, RuFlo UI, and OpenHands. `depends_on` is not enough.
- [x] P0: Put vLLM under a real lifecycle manager. User systemd service `factory-vllm.service` is repo-templated in `runtime/systemd/factory-vllm.service`; model wrappers start/unmask or stop/disable/mask it so vLLM stays stopped by default. `factory-stack.service` no longer has `Wants=factory-vllm.service`.
- [ ] P0: Lock network exposure. Services are bound to `0.0.0.0`; bind to localhost where possible or add local auth before exposing dashboards.
- [ ] P0: Add per-agent workspace guardrails: git snapshot before each run, allowlisted write paths, config-file HITL gate, and rollback instructions.
- [ ] P0: Reduce Docker socket blast radius. RuFlo and OpenHands can reach `/var/run/docker.sock`; document why, restrict where possible, and isolate destructive tool use.
- [ ] P1: Implement a real context-engineering layer. The model is intentionally capped at 32k context, so every run needs context packs, summaries, exact evidence, and Qdrant recall instead of raw log/file flooding.
- [ ] P1: Add research provenance. Firecrawl/Tavily outputs must store URL, fetch time, title, extracted markdown, citation hash, and run id.
- [ ] P1: Add observability: GPU/VRAM, WSL RAM/swap, token throughput, queue depth, request latency, OpenHands iterations, RuFlo task status, and browser/UI stream pressure.
- [x] P1: Add backup/restore scripts for Qdrant, RuFlo project state, RuFlo UI persistence, OpenHands state, LiteLLM config, and vLLM scripts. Verified with `/home/revelation/factorygrid_backups/factorygrid-20260623T015331Z.tar.gz`; includes manifest/checksum, Qdrant snapshot, dry-run restore, and excludes secrets by default.
- [ ] P1: Decide the `agent_qwen_code` container purpose. It currently tails forever; either give it a worker contract or remove it.
- [ ] P1: Initialize/require git in active workspaces before autonomous edits. RuFlo UI currently needs reliable diff/commit/rollback visibility.
- [ ] P2: Replace the PDF's loose FIFO log bridge with a native RuFlo UI backend stream adapter that throttles and virtualizes logs.
- [ ] P2: Treat Claude Code integration as optional. Do not make Claude Code a core runtime dependency for Revelation.
- [ ] P2: Keep Qwen3-Coder out of stable path for now. Evaluate it only in a separate test launcher after factory stability is measurable.

## Current Stack Snapshot

- vLLM: stopped by default. On-demand profile `qwen-coder-awq-daily` serves `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` at `http://localhost:18000/v1`.
- LiteLLM: `qwen-coder-14b`, served at `http://localhost:4000/v1`.
- Qdrant: `http://localhost:6333`.
- OpenHands: `http://localhost:3001`, `max_iterations=40`, model `openai/qwen-coder-14b`.
- RuFlo MCP: host port `3011`, container port `3010`.
- RuFlo UI: `http://localhost:28580` API and `http://localhost:28589` UI route.
- Daily vLLM profile: `MAX_MODEL_LEN=8192`, `MAX_NUM_SEQS=1`, `GPU_MEM=0.50`, `MAX_BATCHED_TOKENS=8192`, `SWAP_SPACE_GB=4`, AWQ Marlin, prefix caching, eager mode.
- GPU status after stopping model runtime: RTX 4090, about 1.1 GiB used and 23.0 GiB free.
- WSL memory after fix: about 47 GiB RAM and 24 GiB swap.

## Repository Fit Decisions

| Source | Fit | Decision | Why |
| --- | --- | --- | --- |
| [mksglu/context-mode](https://github.com/mksglu/context-mode) | Perfect fit | Implement first as the reduced-context control layer or adapt its patterns into RuFlo/OpenHands. | It targets AI coding-agent context optimization, sandboxed tool output, on-demand retrieval, URL fetch/index, session stats, and context savings. This directly addresses the 32k context cap. |
| [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | High fit | Add as the research ingestion service behind RuFlo researcher flows. | It provides search, scrape, clean markdown/structured data, JS-heavy page handling, media parsing, and agent/MCP readiness. This is better for deep app research than simple one-shot search. |
| [garrytan/gstack](https://github.com/garrytan/gstack) | Medium-high fit | Borrow workflow gates and command taxonomy, not the whole runtime. | Its CEO, designer, engineering, release, documentation, QA, health, guard, and review commands map well to a software factory's checks and balances. It is Claude Code-shaped, so adapt concepts into RuFlo prompts/skills. |
| [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) | Medium fit | Use as an agent role library and prompt reference. | The repo is a broad catalog of specialized agents with deliverables and success metrics. Useful for RuFlo agent definitions, but too generic to become the orchestrator. |
| [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | Optional fit | Keep as an optional Claude Code bridge for code review/delegation. | It lets Claude Code call Codex review/delegation commands through the local Codex runtime. Useful if Claude Code is installed, but not required for Revelation's RuFlo/OpenHands/Qwen stack. |

## TODO From Attached PDF

The PDF contains useful intent but should not be copied directly into production. Convert it into validated implementation tasks:

- [ ] Create `docs/FACTORYGRID_WORKFLOW_SPEC.md` from the PDF's workflow idea, but rewrite it against actual Revelation services, ports, and file paths.
- [ ] Add `docs/agents/ruflo_agent_prompts.md` with a minimal agent set: `Queen`, `Architect`, `Researcher`, `Coder`, `Reviewer`, `Tester`, `Documenter`.
- [ ] Convert the PDF's "Queen" prompt into a real RuFlo state contract that emits `task_manifest.json`, `architecture_blueprint.json`, `validation_report.md`, and `handoff_summary.md`.
- [ ] Add a config-file HITL gate for `.env`, Compose files, dependency manifests, root config, credentials, and mount definitions.
- [ ] Build a VRAM/RAM telemetry script, but do not make it kill processes automatically in v1. Alert first.
- [ ] Reject the PDF's current `ingest_memories.py` as-is. It has fragile parsing, bad path defaults, naive chunking, and no provenance model.
- [ ] Replace "Semantic Context Triplets" with a typed memory schema: `source_path`, `symbol`, `summary`, `exact_excerpt`, `hash`, `language`, `dependencies`, `last_verified`, `run_id`.
- [ ] Add a Qdrant ingestion job that skips generated folders, `node_modules`, `.git`, build outputs, secrets, and large binaries.
- [ ] Replace the loose FIFO/SSE bridge with a RuFlo UI backend API that streams logs by `run_id`, throttles updates, caps retained lines, and supports virtualized rendering.
- [ ] Add OpenHands log export via shared mounted log directory only after verifying OpenHands actually writes the needed logs there.

## P0 - Stabilize The Factory Before More Features

- [ ] Create `.env.example` and move all keys/secrets out of Compose.
- [ ] Add `.gitignore` coverage for `.env`, secrets, logs, PID files, Qdrant snapshots, OpenHands runtime state, and local model caches.
- [x] Pin Compose images by version or digest.
- [x] Build local images for RuFlo and RuFlo UI instead of installing global CLIs every boot.
- [x] Add `bin/factory-check-runtime-pins.sh` for digest pinning and locked-bootstrap drift checks.
- [ ] Add `restart: unless-stopped` plus healthchecks to each long-running service.
- [x] Add `bin/factory-doctor.sh`:
  - [x] verify WSL distro is `revelation`
  - [x] verify vLLM on-demand port 18000, optional unless `FACTORY_REQUIRE_MODEL=yes`
  - [x] verify LiteLLM private port 4000 and LAN proxy port 4001
  - [x] verify Qdrant port 6333
  - [x] verify OpenHands port 3001
  - [x] verify RuFlo MCP host port 3011
  - [x] verify RuFlo UI API port 28580 and UI route port 28589
  - [x] verify GPU memory, WSL RAM, swap, disk free, Docker state
- [x] Add `bin/factory-backup.sh` and `bin/factory-restore.sh`.
- [x] Add `bin/factory-logs.sh` for a single view of Compose logs, vLLM logs, and recent OpenHands/RuFlo run logs.
- [x] Add stopped-by-default model lifecycle wrappers and profiles:
  - [x] `bin/factory-model-start.sh`
  - [x] `bin/factory-model-stop.sh`
  - [x] `bin/factory-model-status.sh`
  - [x] `runtime/model-profiles/qwen-coder-awq-daily.env`
  - [x] `runtime/model-profiles/qwen-coder-awq-batch.env`
  - [x] `runtime/model-profiles/redteam-qwq-abliterated-32b.env`
  - [x] `runtime/model-profiles/blueteam-glm.env`
  - [x] `docs/MODEL_PROFILES.md`
  - [x] `runtime/systemd/factory-vllm.service`
  - [x] Red-team profile corrected to use the vLLM/LiteLLM OpenAI-compatible harness instead of a separate Ollama runtime

## P1 - Context Engineering Layer

- [ ] Evaluate `context-mode` locally in a separate test folder first:
  - [ ] install with Node 20-compatible path
  - [ ] run `ctx_doctor`
  - [ ] test `ctx_execute`, `ctx_search`, `ctx_fetch_and_index`, `ctx_stats`
  - [ ] measure context savings against a RuFlo/OpenHands test run
- [ ] If compatible, expose context-mode as an MCP server in the RuFlo project.
- [ ] If not compatible, implement its core pattern locally:
  - [ ] sandbox noisy command output
  - [ ] summarize large logs before model context
  - [ ] cache fetched URLs for 24 hours
  - [ ] index exact snippets into Qdrant
  - [ ] expose context stats per run
- [ ] Define `context-pack.md` format:
  - [ ] user goal
  - [ ] constraints
  - [ ] active files
  - [ ] allowed write paths
  - [ ] exact evidence
  - [ ] retrieved memories
  - [ ] unresolved assumptions
  - [ ] validation commands
- [ ] Add a hard rule: agents may request more context, but may not dump entire repos/logs into prompts.

## P1 - Research Ingestion With Firecrawl

- [ ] Decide hosted Firecrawl API vs self-hosted Firecrawl. Hosted is faster; self-hosted has AGPL and operational overhead.
- [ ] Add `research_provider` abstraction: Tavily for quick search, Firecrawl for page extraction/crawling, Qdrant for retained knowledge.
- [ ] Store every research artifact with URL, title, fetched_at, extractor, raw hash, markdown path, summary path, and originating task id.
- [ ] Add crawl limits: max pages, max depth, max bytes, timeout, domain allow/deny list.
- [ ] Add citation rules: no researched claim enters a plan without source URL and fetch timestamp.
- [ ] Add Qdrant collection `factory_research_sources`.
- [ ] Add a RuFlo `Researcher` worker that produces `research_brief.md` and `source_manifest.json`.

## P1 - Agent Roles And Governance

- [ ] Import selected `agency-agents` ideas as local prompt references, not as direct runtime dependencies.
- [ ] Start with these roles:
  - [ ] `Software Architect`
  - [ ] `Codebase Onboarding Engineer`
  - [ ] `Security Engineer`
  - [ ] `Code Reviewer`
  - [ ] `Technical Writer`
  - [ ] `DevOps Automator`
- [ ] Adapt `gstack` workflow gates:
  - [ ] CEO/product review before implementation
  - [ ] engineering review before file edits
  - [ ] design review for UI work
  - [ ] QA-only pass before completion
  - [ ] release/doc pass after validation
- [ ] Add task state machine:
  - [ ] `INTAKE`
  - [ ] `RESEARCH`
  - [ ] `SPEC`
  - [ ] `PLAN`
  - [ ] `IMPLEMENT`
  - [ ] `VERIFY`
  - [ ] `REVIEW`
  - [ ] `DOCUMENT`
  - [ ] `SHIP`
- [ ] Require artifacts at every transition.

## P2 - RuFlo UI And Agent Visibility

- [ ] Add run/session ids everywhere: RuFlo run, OpenHands conversation, research artifacts, Qdrant memories, UI log stream.
- [ ] Add virtualized log rendering in RuFlo UI for terminal output.
- [ ] Add per-agent panels:
  - [ ] current task
  - [ ] model/backend
  - [ ] status
  - [ ] recent tool calls
  - [ ] current artifact
  - [ ] token/time counters if available
- [ ] Add workspace diff panel:
  - [ ] created files
  - [ ] modified files
  - [ ] deleted files
  - [ ] staged/unstaged status
  - [ ] rollback command
- [ ] Add safety badges for protected file edits and Docker socket usage.

## P2 - Optional Claude Code / Codex Bridge

- [ ] Do not block Revelation on Claude Code.
- [ ] If Claude Code is installed later, test `openai/codex-plugin-cc` as an optional reviewer/delegation surface.
- [ ] Use it only for human-invoked review commands, not autonomous production loops.
- [ ] Keep Codex/OpenAI credentials separate from local LiteLLM/Qwen routing.

## Model Decision

- [ ] Keep stable model path on `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` for now.
- [ ] Keep `MAX_NUM_SEQS=4` while VRAM telemetry remains below alert threshold.
- [ ] Do not move Qwen3-Coder into the main factory path until:
  - [ ] dedicated test launcher exists
  - [ ] dependency versions are isolated
  - [ ] resident VRAM footprint is measured
  - [ ] throughput is compared against Qwen2.5-Coder-14B-AWQ
  - [ ] tool-call loop behavior is tested under OpenHands and RuFlo

## Acceptance Criteria

- [ ] Factory can restart cleanly from one command.
- [ ] No secrets are present in Compose or committed state.
- [ ] Healthcheck output clearly shows which component is broken.
- [ ] A rough idea can produce research, a spec, a plan, tasks, implementation, validation, and documentation artifacts.
- [ ] Every generated artifact has a run id and source context.
- [ ] Long logs do not freeze RuFlo UI.
- [ ] Qdrant contains exact provenance, not untraceable summaries.
- [ ] Agents cannot silently edit protected configuration files.
- [ ] Operator can see what each agent is doing and why.

## Source Links

- Agency Agents: https://github.com/msitarzewski/agency-agents
- Firecrawl: https://github.com/firecrawl/firecrawl
- Context Mode: https://github.com/mksglu/context-mode
- Codex plugin for Claude Code: https://github.com/openai/codex-plugin-cc
- GStack: https://github.com/garrytan/gstack

## P0 - Factory Brain + Spec Kit Intake

- [x] Add Factory Brain v0 markdown storage with compiled truth and append-only timeline pages.
- [x] Add Spec Kit artifact directories: `intake`, `specs`, `plans`, `tasks`, `checklists`.
- [x] Add RuFlo UI Factory page at `http://localhost:28580/factory`.
- [x] Add API endpoints: `/api/factory/guide`, `/api/factory/intake`, `/api/factory/brain/search`.
- [x] Document the operator workflow in `instructions.md`, `README.md`, `Guidelines.md`, `Architecture.md`, and `docs/FACTORYGRID_WORKFLOW_SPEC.md`.
- [ ] Evaluate upstream `github/spec-kit` CLI as a pinned optional adapter after the local artifact contract is stable.
- [ ] Add a full skillify pipeline that turns repeated failures into tested local skills.
- [ ] Add deterministic minion/job queue for snapshots, indexing, maintenance, and reports.

## P1 - Blue-Team-CELL

- [x] Add server/agents/blue-team-cell contract.
- [x] Seed defensive 2G-6G/O-RAN source manifest and research brief.
- [x] Add Factory Brain agent page for Blue-Team-CELL.
- [x] Register Blue-Team-CELL in RuFlo config.
- [ ] Add scheduled source refresh for NIST, ENISA, CISA/NSA, GSMA, 3GPP, Open5GS, UERANSIM, OAI, Osmocom, and cellular security research papers.
- [ ] Build a lab-only validation plan using Open5GS/UERANSIM/NIST O-RAN automation.

## P0 - Principal-Level Agent Readiness And SAGE Memory

- [x] Create role-specific first-start growth artifacts for every current agent.
- [x] Seed Qdrant `factory_memory` with Factory Brain and agent-growth artifacts.
- [x] Add CodeRabbit review loop and resolve review findings from the agent-growth seeder.
- [x] Add SAGE/principal readiness analysis in `docs/agent-readiness/SAGE_AND_PRINCIPAL_AGENT_READINESS.md`.
- [ ] Replace lexical fallback vectors with a real local embedding endpoint.
- [x] Add initial SAGE-style graph memory nodes/edges JSONL schema.
- [ ] Add evidence-chain retrieval endpoint over SAGE-style graph memory.
- [ ] Add reader feedback tasks that repair or supersede stale memory.
- [ ] Add domain readiness gates for latency-sensitive trading/connectivity systems.
- [ ] Add Maven/Gradle dependency freshness checker for Java agent tasks.

## P0 - Adversarial Queen And Technology Choice

- [x] Add Technology Strategist agent contract.
- [x] Add GitHub Risk Scout agent contract.
- [x] Add Performance Engineer agent contract.
- [x] Add `gate_technology_choice.py` for complex stack decisions.
- [ ] Implement a RuFlo callable GitHub Risk Scout task runner in the UI.
- [ ] Implement evidence-chain retrieval endpoint for SAGE-style memory graph.

## P0 - Product Boundary Standard

- [x] Add `server/hooks/gate_product_docs.py`.
- [ ] Extend RuFlo/Queen to reject future product tasks that place product binaries in factory-global `bin/`.
- [ ] Add a product skeleton generator for `bin/`, `config/`, `docs/`, `runtime/`, `protocols/`, and container files.
