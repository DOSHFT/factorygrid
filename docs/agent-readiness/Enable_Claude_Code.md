# Enable Claude Code CLI — Integration Guide for FactoryGrid / Ruflo

**Status:** Production-ready guidance + Codex/Implementer tasking spec (as of 2026-05-27)  
**Skill Context:** Activated via `/agent-neural-network` (hierarchical topology, memory-first, pattern storage, reader-writer feedback)  
**Owner:** Queen (orchestration discipline) + Researcher (evidence) + Neural Network layer (routing learning)  
**Related:** `not_installed.md`, `PROBLEMS.md`, `SAGE_AND_PRINCIPAL_AGENT_READINESS.md`, `SAGE_MEMORY_SCHEMA.md`, `FACTORYGRID_AGENT_LESSONS.md`

---

## Executive Decision Record

**Primary integration surface for interactive human use: Windows host** (the machine where you work).

**Do not make Claude Code a core runtime dependency inside `wsl -d revelation`.**

This is the explicit, documented project stance:

- `todo-factory.md:24` and P2 section (~165-200):
  > "P2: Treat Claude Code integration as optional. Do not make Claude Code a core runtime dependency for Revelation."

- `docs/superpowers/plans/2026-05-17-factory-p0-p2.md`: Keep the stable Qwen + vLLM + LiteLLM + OpenHands + Ruflo stack. Claude Code is not a required runtime dependency.

**The factory already has a complete, high-performance local LLM path** for all autonomous agent work (OpenHands, code workers, ruflo swarm, memory writes, tasks). That path is **OpenAI-compatible** via LiteLLM (`factory_litellm:4000`) → vLLM Qwen2.5-Coder-14B-AWQ (`:8000` inside revelation). It requires zero Anthropic SDK or `claude` binary.

Claude Code CLI is a **developer productivity + optional delegation tool**. Place the primary interactive surface where the developer actually lives and works.

---

## Current State (Live Verification)

### Windows Host
- `claude --version`: 2.1.117 (Scoop)
- Location: Windows .exe under Scoop
- Config: "Not logged in"
- Env: No `ANTHROPIC_BASE_URL` or `ANTHROPIC_API_KEY`
- Status: Usable interactively on host, but pointed at Anthropic cloud (or broken) instead of local models.

### Inside revelation (172.20.86.232 WSL — Primary Factory Runtime)
- Only the Windows `claude.exe` is visible (`/mnt/d/Scoop/...`)
- Invocation → "Exec format error"
- No native Linux `@anthropic-ai/claude-code`
- No `~/.claude`, `~/.config/claude/config.json`, no `ANTHROPIC_*` vars
- Health checks (`server.ts:715`) report **warn** (intentional)

### Working Local LLM Path (Production Today)
- vLLM Qwen2.5-Coder-14B-Instruct-AWQ on `:8000`
- LiteLLM gateway on `:4000` / `:4001` (OpenAI-compatible)
- `litellm_config.yaml`: single alias `qwen-coder-14b`
- `docker-compose.yml` injections: `OPENAI_API_BASE: http://litellm:4000/v1` (and `LLM_BASE_URL` equivalents) into ruflo_orchestrator, rufloui, openhands_engineer, qwen_code_worker, etc.
- This powers every autonomous agent execution, task, and memory write.

**Conclusion:** Local LLM = fully operational for the factory. Anthropic/Claude Code path = completely unwired (by design).

---

## Architectural Reality (Hybrid Split)

**Revelation WSL** = autonomous factory execution surface (28589 tsx primary + Docker compose on 28580/88/4000/8000/6333/3010/etc.)

**Windows host** = human developer surface (editing, review, daily terminal work, decision making).

Ruflo already encodes this split:

- `rufloui/src/backend/server.ts` (~703-715 health, ~790-799 preflight, ~1311 `runClaude()`, ~1404/1712 task paths): Claude Code is an **optional** multi-agent step. Warn-only. Convenience install offered.
- `todo-factory.md` + plans: Explicit "optional / P2 / do not block".
- Single-gateway design: All real agent traffic goes through LiteLLM in OpenAI format.
- Memory (`memory/memory_core.py`, `workspace/factory-brain/graph/`): Typed graph (SAGE paper → evidence-chain-retrieval, reader-writer feedback, typed-graph-memory). Queen/researcher growth seeds promote only verified, role-specific lessons.

`@claude-flow/neural` (alpha.9) + `@ruvector/sona` + agentdb exist in lockfile and are declared in `ruflo_project/AGENTS.md`, but the local skill `agent-neural-network` is still a stub. The neural layer is **declared but not yet active** for routing decisions.

---

## The Two Integration Modes + The Practical Hybrid

### Mode 1: Interactive / Human-in-the-Loop (Primary Recommendation)
**Location:** Windows host (or hybrid hook into revelation binary — see below)

Use cases: You typing `claude "review this..."`, code reviews, delegation from your terminal, pair-programming companion.

### Mode 2: Autonomous / Swarm / Agent Delegation
**Location:** Native inside revelation (for agents to call `claude` or Anthropic SDK during tasks)

Use cases: Queen/researcher/coder/reviewer agents delegating review/work inside tasks; neural layer learning "which provider+format wins for this role/evidence chain".

**Current Stance:** P2 / do not block core factory. Pursue only after Mode 1 is solid and you have a concrete need.

---

## Hybrid Invocation Model (Install Native in Revelation + Hook from Desktop)

**This is the practical answer to "Can't we install it on revelation but also hook into it from the desktop/host?"**

**Yes. This is the recommended long-term shape.**

### Why Hybrid Wins for Your Workflow

- The `claude` binary must run **inside revelation** to have:
  - Correct filesystem view (`/workspace`, `/factorygrid`, mounts from D:\UAT)
  - Docker socket access (same as OpenHands workers)
  - Same environment as the rest of the swarm
  - Low-latency access to LiteLLM inside the Docker network (`http://litellm:4000/...`)

- You live on the **Windows desktop**. You want to type `claude-rev "..."` (or equivalent) from PowerShell / Windows Terminal without manually SSHing or switching contexts every time.

**Single binary. Multiple clean invocation surfaces.**

### Invocation Surfaces (All Point at the Same Native Binary + Same ANTHROPIC_BASE_URL)

1. **WSL interop (fastest from PowerShell)**
   ```powershell
   wsl -d revelation -- bash -lc 'ANTHROPIC_BASE_URL=http://litellm:4000/anthropic ANTHROPIC_API_KEY=not-needed claude "review the current task graph"'
   ```

2. **SSH (already working on 2222 + portproxy)**
   ```powershell
   ssh -p 2222 revelation@localhost -- claude "..."
   ```

3. **Thin wrapper on host (recommended daily driver)**
   - `claude-rev.ps1` (or `.cmd`) in a PATH directory, or function in `$PROFILE`.
   - Automatically injects the correct env + calls `wsl -d revelation -- bash -lc ...`
   - You type: `claude-rev "fix the portproxy detection"`

4. **Future: Agent delegation inside revelation**
   - Same binary, same `ANTHROPIC_BASE_URL`.
   - Called from `server.ts` `runClaude()` or from skills/queen/researcher agents.
   - The neural layer (`agent-neural-network` + SONA) can now learn routing outcomes.

This unifies Mode 1 (you on desktop) and Mode 2 (swarm inside revelation) on one correct install.

### Trade-offs

**Pros**
- Binary lives in the real factory environment.
- Seamless desktop invocation.
- Zero duplication.
- Ready for neural learning loop (same surface for human and agent use).

**Cons / Gotchas**
- Interactive TUI over `wsl -d` or SSH is good but not identical to native Windows terminal (occasional raw input / resize quirks).
- Must inject `ANTHROPIC_*` vars inside the WSL context on every wrapper call (solved by the wrapper script).
- Still requires LiteLLM (or thin shim) to speak Anthropic Messages API format.

---

## Implementation Roadmap (Codex / Implementer Ready)

### Phase 0 — Prep + Memory / Graph (Do First)
- Backup discipline on every critical file (`.bak.YYYYMMDD-HHMMSS`).
- Add capability nodes + edges to `workspace/factory-brain/graph/` (typed-graph-memory pattern).
- Update queen/researcher pages if needed.
- Write this decision as a durable memory episode via `UltronMemoryCore` or fallback.

**Deliverables**
- New nodes/edges (verbatim JSONL below)
- Memory write confirmation (or PR with the graph diff)

### Phase 1 — LiteLLM Anthropic Route + Host Wrapper (Mode 1 / Hybrid Quick Win)
- Extend `litellm_config.yaml` with an Anthropic-compatible route for the Qwen model (or add a thin sidecar proxy).
- Create Windows wrapper script(s) (`claude-rev.ps1` + optional `.cmd`) + document the `$PROFILE` function.
- Set `ANTHROPIC_BASE_URL` on host (or inside the wrapper only).
- Add a small health note in the factory dashboard (optional but clean).

**Files to touch**
- `litellm_config.yaml`
- New: `bin/claude-rev.ps1` (and/or `bin/claude-rev.cmd`)
- `docs/agent-readiness/Enable_Claude_Code.md` (this file — update status)
- Optional: `rufloui/src/backend/server.ts` (small health surface)

**Acceptance**
- From Windows host: `claude-rev "hello"` succeeds and uses local Qwen (visible in LiteLLM logs or vLLM).
- No change to existing OpenAI-compatible agent path.
- Full backup of every edited file.

### Phase 2 — Native Linux Install + Env Injection in Revelation (Unblock Mode 2)
- Install native `@anthropic-ai/claude-code` inside revelation (or the ruflo_orchestrator container image).
- Inject `ANTHROPIC_BASE_URL` + key into `docker-compose.yml` for rufloui, ruflo_orchestrator, and any agent containers that should be able to call it.
- Update revelation-side shell profiles or service env if direct `wsl -d` use is expected.

**Files**
- `docker-compose.yml` (environment blocks)
- Possibly `docker/ruflo/Dockerfile` or revelation bootstrap scripts
- New or extended: `bin/wire-claude-local.sh` (production-ready, with backups + health)

**Acceptance**
- Inside revelation: `which claude` returns a native Linux binary.
- `ANTHROPIC_BASE_URL` is visible and points at the Anthropic-compatible LiteLLM route.
- Existing OpenAI path for agents remains untouched.

### Phase 3 — Wire into Ruflo / Server.ts (Optional Delegation)
- Make `runClaude()` (and any skill wrappers) respect the presence of the Anthropic env and fall back gracefully.
- Add preflight / health surface for the new routing mode (still warn-only unless you change policy).
- Update any documentation that claims "Claude Code for multi-agent pipeline".

**Exact locations**
- `rufloui/src/backend/server.ts:703-715` (health), `790-799` (preflight), `1311`+ (`runClaude` body), `1404`, `1712` (call sites)

**Acceptance**
- Agents can be configured (or learn) to use the Anthropic path for specific roles without breaking the default OpenAI path.
- All changes backed up; production-restart validated.

### Phase 4 — Implement Real `agent-neural-network` Skill + SONA Hooks
- Replace the stub at `ruflo_project/.agents/skills/agent-neural-network/SKILL.md` with real content:
  - Trigger conditions (e.g., on task assignment, on routing decision points, on `/agent-neural-network` invocation).
  - Memory writes via `UltronMemoryCore.add_memory` (or direct graph append) with full provenance and temporal fields.
  - Hierarchical handoff to queen (orchestration) and researcher (evidence capture).
  - Reader-writer feedback: on task outcome, call `repair_memory` if the chosen provider produced weak evidence chains.
  - SONA / @claude-flow/neural integration points (once those packages are actively used in the local source).
- Add or extend `neural-training` skill if it is the training counterpart.

**Acceptance**
- `/agent-neural-network` (or equivalent trigger) writes a verifiable memory episode / graph node.
- Routing decisions become first-class citizens in the factory-brain graph and can be queried / repaired.

### Phase 5 — Validation Harness + Neural Learning Loop + Handoff
- Run through existing harness: `bin/factory-doctor.sh`, `bin/factory-live-snapshot.sh`, scheduler/monitor pulses, `/api/monitoring/fabric`, `/health`.
- Execute small validation tasks through the swarm using both paths and record outcomes in the graph.
- Update `FACTORYGRID_AGENT_LESSONS.md` (or the brain) with the new pattern.
- Produce a clean handoff note / Codex task list for any remaining work.

**Acceptance**
- Both paths (OpenAI-compatible default + optional Anthropic via Claude Code) are observable, measurable, and learnable by the neural layer.
- No regression in the core factory (28589/28580 health green, tasks succeed, memory writes occur).

---

## Exact Graph Updates (Copy-Paste Ready)

**Append to `workspace/factory-brain/graph/nodes.jsonl`:**

```json
{"id": "capability:anthropic-local-routing", "title": "Anthropic / Claude Code local LLM routing (hybrid host+revelation)", "type": "capability"}
{"id": "source:claude-code-host", "title": "Claude Code on Windows host (interactive via wrapper or SSH)", "type": "source"}
{"id": "source:claude-code-revelation", "title": "Native Claude Code inside revelation (for swarm delegation)", "type": "source"}
{"id": "decision:claude-optional-host-primary-hybrid-revelation", "title": "Claude Code integration is host-interactive first via hybrid hook into revelation binary; revelation autonomous is P2 optional", "type": "decision"}
```

**Append to `workspace/factory-brain/graph/edges.jsonl`:**

```json
{"from": "paper:sage-2605.12061", "to": "capability:anthropic-local-routing", "type": "supports", "confidence": 0.75}
{"from": "capability:anthropic-local-routing", "to": "agent:queen", "type": "used_by", "confidence": 0.9}
{"from": "decision:claude-optional-host-primary-hybrid-revelation", "to": "capability:anthropic-local-routing", "type": "supersedes", "reason": "Keeps core factory on proven OpenAI path; host is human surface; hybrid hook unifies invocation"}
{"from": "capability:anthropic-local-routing", "to": "source:litellm", "type": "requires"}
{"from": "capability:anthropic-local-routing", "to": "source:claude-code-host", "type": "derived_from"}
{"from": "capability:anthropic-local-routing", "to": "source:claude-code-revelation", "type": "derived_from"}
```

---

## Scripts to Create (Minimum Viable)

### 1. Windows Wrapper (`bin/claude-rev.ps1` — recommended)

```powershell
# claude-rev.ps1
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)

$env:ANTHROPIC_BASE_URL = $env:ANTHROPIC_BASE_URL ?? "http://192.168.178.20:4000/anthropic"
$env:ANTHROPIC_API_KEY  = $env:ANTHROPIC_API_KEY  ?? "not-needed-for-local"

wsl -d revelation -- bash -lc "ANTHROPIC_BASE_URL=$env:ANTHROPIC_BASE_URL ANTHROPIC_API_KEY=$env:ANTHROPIC_API_KEY claude $Args"
```

Add to PATH or call via `& "$PSScriptRoot\bin\claude-rev.ps1" ...`

### 2. Optional CMD shim (`bin/claude-rev.cmd`)

```batch
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0claude-rev.ps1" %*
```

### 3. Revelation-side wiring helper (optional but production-grade)

`bin/wire-claude-local.sh` — follows the same pattern as `production-restart-rufloui.sh` (backups, logging, health wait, graceful).

---

## LiteLLM Config Delta (Minimal)

Append or extend in `litellm_config.yaml`:

```yaml
model_list:
  - model_name: qwen-coder-14b-anthropic
    litellm_params:
      model: openai/Qwen/Qwen2.5-Coder-14B-Instruct-AWQ   # or anthropic/ if passthrough
      api_base: http://host.docker.internal:8000/v1
      api_key: "not-needed"
```

(Adjust provider string according to actual LiteLLM Anthropic passthrough syntax at implementation time.)

---

## Risk Register + Mitigations

- **Risk:** Breaking the single-gateway OpenAI path for agents.  
  **Mitigation:** Never remove or alter existing `OPENAI_API_BASE` injections. Anthropic route is additive only. All changes behind feature flags or env vars initially.

- **Risk:** TUI friction over WSL/SSH.  
  **Mitigation:** Document the limitation. For heavy interactive sessions, user can SSH in directly. Wrapper is for convenience + delegation, not the only surface.

- **Risk:** LiteLLM Anthropic format support is incomplete.  
  **Mitigation:** Fallback to a tiny dedicated proxy container if needed. Keep the OpenAI path as the blessed default.

- **Risk:** Scope creep into making Claude Code mandatory.  
  **Mitigation:** Every change keeps the "optional + warn-only" posture. Update health checks and docs explicitly.

---

## Validation & Acceptance Matrix

- Host wrapper `claude-rev "..."` succeeds and model calls appear in vLLM/LiteLLM logs.
- Inside revelation: native `claude --version` works and respects `ANTHROPIC_BASE_URL`.
- Existing OpenAI-compatible agent path (OpenHands, workers, tasks) is 100% unaffected.
- `/health` and `/api/monitoring/fabric` remain green or show only expected warns.
- New graph nodes/edges are queryable and the memory system can retrieve the routing decision with provenance.
- Small swarm task executed with both paths; outcomes written via reader-writer feedback.
- All critical files have `.bak.YYYYMMDD-HHMMSS` backups.

---

## Handoff Template (for Codex or Future Implementer)

```
Task: Enable Claude Code CLI hybrid integration (host interactive + revelation native with desktop hook)

Context: See D:\UAT\factorygrid\docs\agent-readiness\Enable_Claude_Code.md (this file) + not_installed.md + todo-factory.md P2 decision + server.ts claude sections.

Constraints:
- Keep Claude Code optional / non-core.
- Primary agent execution stays on proven OpenAI-compatible LiteLLM path.
- Full backup discipline on every critical edit.
- Memory/graph updates required (typed-graph-memory + reader-writer feedback).

Phases: 0-5 as defined in this document.

Primary artifacts to produce:
- litellm_config.yaml delta
- bin/claude-rev.ps1 + .cmd (with docs)
- docker-compose.yml + revelation env injection
- server.ts updates (runClaude + health)
- Real implementation of ruflo_project/.agents/skills/agent-neural-network/SKILL.md
- Graph nodes/edges additions
- Validation run through factory-doctor / live-snapshot / monitor harness

Success = both paths observable, measurable, and learnable by the neural layer with no regression in the core factory.
```

---

## References (Exact)

- Decision: `todo-factory.md:24`, `165-200`
- Health / preflight / runClaude: `rufloui/src/backend/server.ts:611, 703-715, 790-799, 1311, 1404, 1712`
- Gateway (working path): `litellm_config.yaml`, `docker-compose.yml:53-76` (litellm), environment injections at 93, 144, 214, etc.
- Memory: `memory/memory_core.py`, `memory/schema.py`, `workspace/factory-brain/graph/nodes.jsonl` + `edges.jsonl`, `pages/agents/queen.md` + `researcher.md`
- Prior gaps: `D:\UAT\factorygrid\docs\agent-readiness\not_installed.md`
- Architecture: `Architecture.md`, `rufloui/CLAUDE.md`, `ruflo_project/CLAUDE.md`, `ruflo_project/AGENTS.md`
- Skill stub: `ruflo_project/.agents/skills/agent-neural-network/SKILL.md`

---

## Pattern Stored (This Activation + Hybrid Update)

"Claude Code CLI is a human-developer + optional delegation surface. Primary interactive integration lives on the Windows host (or via thin hybrid hook into a native binary inside revelation). The autonomous factory already has a complete, high-performance local LLM path via OpenAI-compatible LiteLLM/vLLM — this remains the blessed default. Anthropic routing is a valuable optional bridge that the neural layer (`agent-neural-network` + SONA + typed graph + reader-writer feedback) should learn over time rather than made mandatory. Hybrid invocation (native in revelation + desktop wrappers) unifies the two modes on one correct binary."

**Memory update:** This document (v2 with hybrid + full Codex tasking) is the durable artifact. Subsequent graph nodes, skill implementation, and validation runs will create the next evidence-chain entries.

---

*Generated and updated under `/agent-neural-network` skill activation. Hierarchical (Queen keeps optional + non-core; Researcher demands evidence + memory writes; Neural layer records routing outcomes as first-class typed capabilities). All prior changes followed strict backup discipline.*

**End of Enable_Claude_Code.md**
