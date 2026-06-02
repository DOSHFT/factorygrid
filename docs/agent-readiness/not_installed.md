# Ruflo Ecosystem & Integrations - Not Installed / Not Configured

**Source:** [Ruflo USERGUIDE.md - Ecosystem & Integrations](https://github.com/ruvnet/ruflo/blob/main/docs/USERGUIDE.md#-ecosystem--integrations)  
**Date of analysis:** 2026-05-27 (re-scanned under `/agent-neural-network` activation)  
**Context:** FactoryGrid / Revelation (uat-factorygrid worktree + D:\UAT\factorygrid production path)

This document lists the Ruflo v3 ecosystem integrations and capabilities explicitly documented in the official USERGUIDE that are **not installed, not configured, or only partially present** in the current FactoryGrid/revelation deployment.

The goal is to provide a clear gap analysis for agent-readiness and production hardening work.

**Re-scan trigger:** `/agent-neural-network` skill invocation + deep audit of Claude Code local LLM routing + hybrid host/revelation architecture + typed graph memory progress (SAGE / evidence chains).

---

## 1. Cloud & Platform Integrations

| Integration | Status in FactoryGrid | Notes |
|-------------|-----------------------|-------|
| **Flow Nexus** (cloud neural/swarm/platform) | **NOT INSTALLED** | No account, no `FLOW_NEXUS_*` env vars, no integration in docker-compose.yml, no flow-nexus-* workers calling the cloud service, no neural-training or swarm-offload to Flow Nexus. The `flow-nexus-neural`, `flow-nexus-platform`, and `flow-nexus-swarm` skills exist as .md files but have no backing implementation or credentials. |
| **RuVector PostgreSQL** (enterprise vector DB with 77+ SQL functions, GNN/attention in SQL, hyperbolic embeddings) | **NOT INSTALLED** | Only local AgentDB + Qdrant (in docker-compose) + file-based graph (nodes.jsonl/edges.jsonl) + Python `memory/` layer (UltronMemoryCore with Graphiti/Neo4j shadow + Qdrant fallback). No PostgreSQL + pgvector + RuVector extension deployment. The SAGE-inspired graph work is a partial local workaround. |

---

## 2. Governance & Long-Horizon Control Plane

| Integration | Status | Notes |
|-------------|--------|-------|
| **`@claude-flow/guidance`** (CLAUDE.md PolicyBundle compiler, retriever, 4 enforcement gates, trust tiers, HMAC proof chain, adversarial defense, conformance kit) | **NOT INSTALLED** | The entire 7-phase pipeline (Compile → Retrieve → Enforce → Trust → Prove → Defend → Evolve) is absent. No package in package.json files, no wiring in rufloui backend, no hooks integration. This remains one of the largest missing pieces for "principal-level autonomous" operation. |

---

## 3. Claude Code Plugin Marketplace & Full Skill Activation

| Integration | Status | Notes |
|-------------|--------|-------|
| **Claude Code Plugin Marketplace registration** (`/plugin marketplace add ruvnet/ruflo` + all `/plugin install ruflo-*`) | **NOT PERFORMED** | The documented one-line installs for `ruflo-core`, `ruflo-swarm`, `ruflo-autopilot`, `ruflo-loop-workers`, `ruflo-security-audit`, `ruflo-rag-memory`, `ruflo-testgen`, `ruflo-docs` etc. have never been executed. The rich `.agents/skills/` folder (80+ .md files) exists because of manual scaffolding, not marketplace installation. |
| **Full 137+ skills activation** | **PARTIAL** | `ruflo_project/.agents/skills/` contains a large number of the documented skills (agentdb-*, v3-*, hive-mind*, github-*, sparc-*, flow-nexus-*, neural-*, etc.), but the complete set referenced in the USERGUIDE is not present or registered. No automated "137+ skills" count or activation script exists. |

**New finding (2026-05-27 re-scan):** The `agent-neural-network` skill (and sibling `neural-training`) remain stubs. Invoked via slash command; best practices listed but no trigger conditions, memory hooks, or SONA integration implemented yet. See new companion doc `Enable_Claude_Code.md` for the full Claude Code local routing analysis.

---

## 4. External MCP Client Configurations (beyond basic Claude Code)

| Client / Environment | Status | Notes |
|----------------------|--------|-------|
| Claude Desktop (`claude_desktop_config.json`) | **NOT CONFIGURED** | No ready-to-paste config block or setup instructions for the revelation/FactoryGrid MCP server. |
| Cursor IDE (`.cursor/mcp.json` + Agent Mode) | **NOT CONFIGURED** | No workspace or global config provided. |
| Windsurf IDE (`~/.codeium/windsurf/mcp_config.json`) | **NOT CONFIGURED** | No config or refresh instructions. |
| VS Code (`.vscode/mcp.json` or Command Palette) | **PARTIAL** | Basic `claude mcp add` is referenced in docs, but no VS Code 1.102+ native MCP config or workspace example exists for the stack. |
| ChatGPT (Connectors + Developer Mode, remote HTTP transport) | **NOT CONFIGURED** | Requires HTTP transport mode (`mcp start --transport http`) + Connector registration. Not implemented. |
| Google AI Studio + MCP SuperAssistant | **NOT CONFIGURED** | No setup. |
| JetBrains AI Assistant MCP settings | **NOT CONFIGURED** | No example for IntelliJ/PyCharm/WebStorm/etc. |
| OpenAI Codex CLI full MCP registration (`codex mcp add ruflo`) | **PARTIAL** | Mentioned in research docs but no automated setup or verification in revelation or production-restart flows. |

---

## 5. Dual-Mode Claude Code + OpenAI Codex Collaboration

| Feature | Status | Notes |
|---------|--------|-------|
| `npx @claude-flow/codex dual templates` + `dual run --template feature|security|refactor` | **NOT INSTALLED / NOT WIRED** | The dual-mode collaboration templates (architectcodertesterreviewer pipelines, Codex workers for background execution, shared memory across platforms) are absent. AGENTS.md generation for Codex mode is not part of `init` flows in this stack. |
| `@claude-flow/codex` package + dual-mode hooks | **NOT PRESENT** | No dependency or integration in ruflo_project or rufloui. |

**Re-scan note:** Deep audit of Claude Code (see `Enable_Claude_Code.md`) confirmed:
- Windows host: Scoop 2.1.117 present but unwired to local LLM.
- Revelation (primary runtime): Only broken Windows .exe visible; no native Linux binary, no `ANTHROPIC_BASE_URL`.
- Actual local LLM usage is OpenAI-compatible only (LiteLLM + vLLM Qwen). Anthropic path is completely separate and optional (P2 per `todo-factory.md`).
- Hybrid model recommended: Native install inside revelation + thin desktop wrappers (`wsl -d revelation -- claude` or PowerShell shim) for human use.

---

## 6. Advanced AgentDB & Intelligence Features (beyond basic recall)

| Feature / Controller | Status | Notes |
|----------------------|--------|-------|
| Full set of advanced AgentDB controllers (CausalRecall, ExplainableRecall, CausalMemoryGraph, MMRDiversityRanker, GuardedVectorBackend, MutationGuard, AttestationLog, RVFOptimizer, GNNService, SonaTrajectoryService, GraphTransformerService, etc.) | **PARTIAL** | Many `agentdb-*` skills exist as .md files. Runtime packages (`@claude-flow/neural`, `@ruvector/sona`, agentdb) are present in lockfile. However, only a subset of the 20+ controllers are actually callable via the running claude-flow daemon or exposed through rufloui/Fabric. Hierarchical memory tiers and consolidation are not wired into the production memory evolution loop. |
| Live SONA / EWC++ / Self-consistency orchestrator training loops | **LIMITED** | Basic `neural-training` skill file exists. Real `@claude-flow/neural` + SONA packages are in the dependency tree. No active training workers, no periodic `neural_train` schedules, and no integration with background workers in the current revelation/Docker setup. |
| Agent Booster (WASM) + Token Optimizer deep hooks | **NOT WIRED** | The USERGUIDE describes automatic routing of simple transforms (varconst, add-types, etc.) to WASM with <1ms latency and 30-50% token savings. No evidence of this in current hooks, pre-task routing, or rufloui task execution path. |

**Re-scan finding:** The local `memory/` layer (`memory_core.py`, `schema.py`) + `workspace/factory-brain/graph/` (nodes.jsonl/edges.jsonl with SAGE paper, typed-graph-memory, evidence-chain-retrieval, reader-writer-feedback) represents real partial progress on the neural/memory substrate. The `agent-neural-network` skill was activated (2026-05-27) and is intended to surface exactly this layer for routing decisions (including future Claude Code vs OpenAI path selection).

---

## 7. Production-Grade Persistence & DR

| Item | Status | Notes |
|------|--------|-------|
| Persistent, versioned, conflict-aware memory graph (SAGE-style writer/reader feedback loop, evidence chains, decay, supersedes) | **PARTIAL / INCOMPLETE** | See `docs/agent-readiness/SAGE_AND_PRINCIPAL_AGENT_READINESS.md`, `SAGE_MEMORY_SCHEMA.md`, and the live `memory/memory_core.py` + `workspace/factory-brain/graph/`. Current implementation has typed nodes/edges, UltronMemoryCore with Graphiti/Neo4j shadow + Qdrant + file fallback, and basic repair loops. Missing: full embedding model wiring, versioning/audit trail at production scale, and complete reader feedback that automatically creates repair tasks across the swarm. |
| Full claims system (human-agent work ownership, claim/release/handoff with cryptographic proofs) | **NOT FULLY ACTIVE** | Skill file exists; integration into swarm topology, task lifecycle, and revelation services is incomplete. |
| Byzantine/Raft/Gossip consensus as live, selectable topologies with monitoring | **BASIC** | Hierarchical is the default in use. Advanced consensus modes and their health/visibility in Fabric/monitoring are not fully exercised or configurable in production-restart flows. |

---

## 8. Other Notable Gaps

- **@claude-flow/guidance conformance-kit** headless test runner — absent.
- **Full 80+ npm SEO keywords** discoverability work for the local packages (minor).
- **Remote HTTP MCP transport** for non-local clients (ChatGPT, etc.).
- **Automated skill/marketplace update mechanism** (`init upgrade --add-missing` behavior for the full 137+ set).
- **Production RuVector + PostgreSQL deployment** (compose profile, backup, monitoring).
- **End-to-end dual-mode Codex + Claude Code example pipelines** running against real FactoryGrid tasks.
- **Native Linux Claude Code + ANTHROPIC_BASE_URL wiring** inside revelation (see new `Enable_Claude_Code.md` for detailed hybrid plan).

---

## Summary - Priority Order for Agent-Readiness (Updated 2026-05-27)

1. **Highest impact missing pieces** (directly affect "principal-level autonomous" claims):
   - `@claude-flow/guidance` governance layer
   - Flow Nexus cloud integration
   - RuVector PostgreSQL production vector DB

2. **High visibility / user experience**:
   - Claude Code Plugin Marketplace full activation
   - Complete external MCP client configs (Cursor, Windsurf, Claude Desktop, etc.)
   - Dual-mode Codex collaboration
   - **Claude Code local LLM routing (hybrid host + revelation native)** — new dedicated spec in `Enable_Claude_Code.md`

3. **Deep intelligence / learning**:
   - Full advanced AgentDB controllers + live SONA/EWC training loops
   - Agent Booster (WASM) + Token Optimizer routing
   - Real implementation of `agent-neural-network` skill + wiring to the typed graph memory (SAGE / evidence chains / reader-writer feedback)

4. **Production hardening**:
   - Complete SAGE-style graph memory with evidence chains and automated feedback repair (strong partial progress in `memory/` + `workspace/factory-brain/graph/`)
   - Full claims + advanced consensus operationalization

---

## How to Use This Document

- Treat this as a **backlog** for the next wave of FactoryGrid hardening.
- Cross-reference with:
  - `docs/agent-readiness/Enable_Claude_Code.md` (new — Claude Code hybrid integration + neural routing)
  - `docs/agent-readiness/SAGE_AND_PRINCIPAL_AGENT_READINESS.md`
  - `docs/agent-readiness/SAGE_MEMORY_SCHEMA.md`
  - `workspace/memory/FACTORYGRID_AGENT_LESSONS.md` (or current equivalent)
  - `ruflo_project/.agents/skills/` (current skill surface)
  - `todo-factory.md` (explicit "Claude Code optional / P2" decision)
- When adding any item above, update this file (mark as configured + date + verification steps).

**Last verification / re-scan:** 2026-05-27 under `/agent-neural-network` skill activation. Performed against:
- Live revelation WSL distro (172.20.86.232)
- D:\UAT\factorygrid source tree
- rufloui 28589/28580 paths + monitoring fabric
- claude-flow daemon behavior
- Full set of custom skills
- `memory/` Python core + `workspace/factory-brain/graph/`
- package-lock.json (@claude-flow/neural + SONA presence)
- server.ts Claude Code health/preflight/runClaude logic
- docker-compose + litellm_config (OpenAI-compatible gateway only)

---

*This file was originally generated as a direct response to a request to audit the Ruflo USERGUIDE "Ecosystem & Integrations" section. Re-scanned and updated 2026-05-27 during active `/agent-neural-network` operation (memory checked, hierarchical topology applied, new patterns stored).*

**Related new artifact:** `Enable_Claude_Code.md` (detailed current-state evidence + hybrid implementation roadmap for Claude Code local LLM routing).