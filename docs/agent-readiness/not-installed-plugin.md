# Ruflo Official Plugins — Not Installed / Not Configured

**Source:** https://github.com/ruvnet/ruflo/tree/main/plugins (32 plugins) + https://github.com/ruvnet/ruflo/blob/main/plugins/README.md  
**Date of analysis:** 2026-05-27 (under `/agent-neural-network` skill activation)  
**Context:** FactoryGrid / Revelation hybrid deployment

This document provides a detailed gap analysis of the **official Ruflo Claude Code plugins** (the 32 plugins in the GitHub `plugins/` directory, loaded via `--plugin-dir`) against the current local build.

**Important distinction:**
- The local project has a large custom skill surface in `ruflo_project/.agents/skills/` (100+ .md files covering agentdb-*, v3-*, neural-*, memory-*, github-*, sparc-*, flow-nexus-*, etc.).
- These are **parallel/custom implementations** or ports, **not** the official Claude Code plugin packages from `ruvnet/ruflo/plugins/`.
- Official plugins follow a specific structure (`.claude-plugin/plugin.json`, `agents/`, `commands/`, `skills/<name>/SKILL.md`) and are loaded with `claude --plugin-dir`.
- No evidence exists that the official 32-plugin set (or even a significant subset) has ever been installed via the marketplace or `--plugin-dir` mechanism.

---

## Deep Dive: ruflo-graph-intelligence

**GitHub location:** `plugins/ruflo-graph-intelligence/`

**What it is (from package.json + plugin manifest):**
- Name: `ruflo-graph-intelligence` (0.1.0-alpha.1)
- Description: "RuFlo Graph Intelligence Engine — real-time relationship intelligence with complexity-aware execution. Single-entry personalized PageRank, streaming delta updates, witness-signed reasoning artifacts over RuFlo's substrate graphs."
- Core tech: `sublinear-time-solver@^1.7.0` + zod.
- Exports: main engine, `./mcp-tools`, `./adapters`.
- Keywords: personalized-pagerank, sublinear, complexity-aware, agent-substrate, signed-reasoning, federation, mcp, claude-flow.
- Peer dependency: `@claude-flow/cli >=3.5.0`.
- Structure: TypeScript, src/, tests/, vitest, .claude-plugin/plugin.json.

**Local build status: NOT IMPLEMENTED**

- Zero references to "ruflo-graph-intelligence", "graph-intelligence", "GraphIntelligence", or the sublinear-time-solver package anywhere in the workspace.
- No `plugins/ruflo-graph-intelligence/` directory.
- No loading via `--plugin-dir`.
- No MCP tools or adapters from this package registered.

**What the local build *does* have in the graph/memory space (partial, custom, parallel work):**
- `workspace/factory-brain/graph/nodes.jsonl` + `edges.jsonl` — small typed graph (SAGE paper reference, typed-graph-memory, evidence-chain-retrieval, reader-writer-feedback capabilities, agent assignments).
- `memory/memory_core.py` (UltronMemoryCore) — hybrid temporal memory with Graphiti/Neo4j primary, Neo4j shadow, Qdrant, file fallback JSONL. Implements `add_memory`, `query`, `repair_memory`, SAGE-style failure → repair loops.
- `memory/schema.py` — typed nodes (entity, episode, artifact, task, run, source, decision) + relations (supports, contradicts, supersedes, derived_from, used_in, invalidated_by) + temporal fields.
- Various custom skills: `memory-management`, `agentdb-*` family, `reasoningbank-*`, `agent-neural-network` (stub), `neural-training` (stub), `agent-sona-learning-optimizer`, `agent-v3-memory-specialist`, etc.
- `ruflo_project/.agents/skills/` contains many memory/intelligence-themed .md files.

**Verdict:** The *spirit* of graph intelligence (typed graphs, evidence chains, memory repair, SAGE-inspired patterns) has partial custom implementation. The **specific logic, algorithms, and artifacts** from the official `ruflo-graph-intelligence` plugin (sublinear personalized PageRank, streaming delta updates, witness-signed reasoning artifacts over substrate graphs) are **completely absent**.

This is one of the most advanced "Memory & Intelligence" plugins and remains a clear gap.

---

## Full Catalog of 32 Official Plugins — Status

### Core & Coordination (5 plugins)

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-core | MCP server, status, doctor, coder/researcher/reviewer agents | Partial (custom) | Core Ruflo concepts exist via claude-flow + custom agents in `ruflo_project/agents/`, but not the official plugin loaded via `--plugin-dir`. |
| ruflo-swarm | Swarm topologies (hierarchical, mesh), Monitor streaming | Partial (custom) | Hierarchical swarm is heavily used. Many swarm-*/agent-swarm* skills. No official ruflo-swarm plugin loaded. |
| ruflo-autopilot | Autonomous /loop task completion with prediction | Not present | No equivalent plugin or skill implementing the documented autopilot behavior. |
| ruflo-loop-workers | 12 background workers via /loop or CronCreate | Partial | Some background monitoring/scheduler use exists (factory-doctor, live-snapshot, monitor tool). Not the official 12-worker plugin. |
| ruflo-workflows | Workflow templates, parallel execution, branching | Partial | Workflow concepts appear in custom skills and tasks, not the official plugin. |

### Memory & Intelligence (7 plugins) — Largest Gap Area

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-agentdb | AgentDB with HNSW vector search (150x-12,500x faster) | Partial (custom) | Many `agentdb-*` skills exist as .md files. Runtime packages present in lockfile. Actual advanced controllers (CausalRecall, etc.) not wired. |
| ruflo-rag-memory | SOTA RAG — hybrid search, Graph RAG, MMR diversity, memory bridge | Partial (custom) | Memory bridge concepts in `memory/` Python layer and factory-brain. Not the official plugin. |
| ruflo-rvf | Portable RVF memory format, session persistence | Not present | No RVF format usage. |
| ruflo-ruvector | ruvector package — FlashAttention-3, Graph RAG, hybrid search, 103 MCP tools, Brain AGI | Not present | Package not installed. No integration. |
| ruflo-knowledge-graph | Entity extraction, relation mapping, pathfinder traversal | Partial (custom) | Custom graph in `workspace/factory-brain/graph/`. No official plugin. |
| ruflo-intelligence | SONA neural patterns, trajectory learning, model routing | Partial (declared) | `@claude-flow/neural` + `@ruvector/sona` in lockfile. `agent-neural-network` and `neural-training` skills are stubs. No active SONA loops. |
| ruflo-daa | Dynamic Agentic Architecture, cognitive patterns | Not present | No equivalent. |

**Special note on ruflo-graph-intelligence:** See deep dive above. Not implemented.

### Architecture & Methodology (3 plugins)

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-adr | ADR lifecycle — create, index, supersede, compliance checking | Partial (custom) | Some ADR-like thinking in docs and research seeds. No official plugin. |
| ruflo-ddd | DDD scaffolding — bounded contexts, aggregates, domain events | Partial (custom) | DDD concepts appear in research and architecture docs. No official plugin. |
| ruflo-sparc | SPARC methodology with 5 phases and quality gates | Partial (custom) | `sparc-methodology` skill + `agent-sparc-coordinator` exist as custom skills. Not the official ruflo-sparc plugin. |

### Quality & Security (4 plugins)

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-security-audit | CVE scanning, dependency vulnerability checks | Partial (custom) | `security-audit` skill with scripts exists. Not the official plugin. |
| ruflo-aidefence | Prompt injection detection, PII scanning | Not present | No equivalent. |
| ruflo-testgen | Test gap detection, TDD London School workflow | Partial (custom) | `agent-tester`, `verification-quality` skills exist. Not the official plugin. |
| ruflo-browser | Playwright browser automation and testing | Not present | No Playwright integration in the stack. |

### Development Tools (8 plugins)

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-jujutsu | Diff analysis, risk scoring, reviewer recommendations | Partial (custom) | `agentic-jujutsu` skill exists. Not the official plugin. |
| ruflo-docs | Doc generation, drift detection, API docs | Partial (custom) | Various docs/ skills and `agent-docs-api-openapi`. Not the official plugin. |
| ruflo-ruvllm | Local LLM inference, MicroLoRA, chat formatting | Not present | Local LLM is handled via vLLM + LiteLLM (OpenAI-compatible). No ruvllm plugin. |
| ruflo-agent | WASM agent sandboxing and gallery | Not present | WASM Agent Booster mentioned in ecosystem gaps but not wired. |
| ruflo-plugin-creator | Scaffold and validate new plugins | Not present | No usage of the official creator. Local skills were manually scaffolded. |
| ruflo-migrations | Database schema migration management | Not present | No evidence. |
| ruflo-observability | Structured logging, tracing, metrics correlation | Partial (custom) | Monitoring harness (factory-doctor, live-snapshot, scheduler/monitor) exists. Not the official plugin. |
| ruflo-cost-tracker | Token usage tracking, budget alerts, cost optimization | Not present | No dedicated cost tracking layer. |

### Domain-Specific (5 plugins)

| Plugin | Official Purpose | Local Status | Notes |
|--------|------------------|--------------|-------|
| ruflo-goals | GOAP planning, deep research, horizon tracking | Partial (custom) | `agent-goal-planner`, `agent-sublinear-goal-planner` skills exist. Not the official plugin. |
| ruflo-federation | Zero-trust cross-installation agent federation | Not present | No federation setup. |
| ruflo-iot-cognitum | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management | Not present | Not applicable / not implemented. |
| ruflo-neural-trader | neural-trader package — 4 agents, LSTM/Transformer, Rust/NAPI backtesting, 112+ MCP tools | Not present | Package not installed. Not relevant to current FIX/market-data work but a declared gap. |
| ruflo-market-data | Market data ingestion, OHLCV vectorization, pattern matching | Partial (custom) | `workspace/research/fix44-market-data-restreamer/` and related specs exist. Not the official plugin. |

---

## Summary of Official Plugin Loading

- **Official `--plugin-dir` usage:** None detected for the ruflo-* set.
- **Claude Code Plugin Marketplace installs:** None recorded.
- **Local skill surface:** Very large and conceptually overlapping in many areas (especially memory, swarm, github automation, sparc, security, neural). This gives the appearance of "many Ruflo features" but they are custom implementations, not the official plugins.
- **Backup exclusion note:** `bin/factory-backup.sh` excludes `factorygrid/ruflo_project/.claude-flow/plugins/node_modules` — evidence that some claude-flow plugin directory existed at some point, but not the full official 32-plugin Ruflo set.

---

## Priority Gaps (Official Plugins)

**Highest (advanced intelligence layer):**
- ruflo-graph-intelligence (see deep dive)
- ruflo-intelligence (SONA)
- ruflo-knowledge-graph
- ruflo-ruvector
- ruflo-rag-memory (full official version)

**High (core experience):**
- ruflo-core + ruflo-swarm (official versions)
- ruflo-autopilot
- ruflo-plugin-creator (to bootstrap more cleanly)

**Medium (quality + dev tools):**
- ruflo-security-audit (official)
- ruflo-aidefence
- ruflo-testgen (official)
- ruflo-jujutsu (official)
- ruflo-cost-tracker

**Domain / future:**
- ruflo-neural-trader + ruflo-market-data (if trading/FIX work expands)
- ruflo-federation

---

## Relationship to Prior Documents

- `not_installed.md` (ecosystem & integrations audit): Covered high-level gaps (Flow Nexus, guidance, RuVector, advanced AgentDB/SONA, WASM, MCP clients, dual Codex+Claude). This plugin audit is the **lower-level, official plugin mechanism** view.
- `Enable_Claude_Code.md`: Details the hybrid Claude Code local LLM routing situation (host vs revelation native + wrappers). The `ruflo-graph-intelligence` gap is one of the advanced capabilities that would benefit from (or integrate with) proper Claude Code plugin loading.
- `SAGE_AND_PRINCIPAL_AGENT_READINESS.md` + `SAGE_MEMORY_SCHEMA.md`: The custom graph memory work that partially overlaps with several "Memory & Intelligence" plugins.

---

## How to Use This Document

- Treat as a **plugin-specific backlog**.
- When evaluating "are we using Ruflo plugins?", the answer is: heavy custom skill surface + zero official `--plugin-dir` loading of the 32-plugin catalog.
- Before adopting any new official plugin, decide whether to:
  A) Load the real plugin via `--plugin-dir` / marketplace, or
  B) Continue extending the custom `.agents/skills/` surface (current pattern).
- Update this file (and cross-reference `not_installed.md`) when any official plugin is actually installed and validated.

**Last verification:** 2026-05-27 under active `/agent-neural-network` skill. Cross-checked GitHub plugin catalog (README + specific graph-intelligence package.json + manifest), full local workspace search (zero matches for graph-intelligence), skill directory contents, package-lock.json, backup scripts, memory/graph system, and prior agent-readiness docs.

---

*Generated as a direct follow-up to the request to review ruflo-graph-intelligence + the full plugins directory against the current FactoryGrid build. Pattern stored in the agent-readiness knowledge base.*
