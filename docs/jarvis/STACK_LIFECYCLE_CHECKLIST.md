# FactoryGrid Solid Application Development Stack — Lifecycle Checklist + Planning Agent

**Goal**: Turn any verbal high-level goal (via Jarvis) into a traceable, gated project that goes through Research (deep + propose/review) → Development → Production/Release with best-possible context engineering outcomes.

**Entry**: Jarvis (RuFloUI FactoryPanel evolution or Hermes chat) accepts talk or form (spec-kit presets). Planning agent creates **project item** and drives the phases.

**Core Loop (every phase)**: Specialized agents *propose* → Reviewers/Queen *review with outcomes recorded* → Iterate (capped) or gate pass → update matrix/brain → next phase or human gate.

All artifacts live in `workspace/spec-kit/`, `workspace/factory-brain/pages/`, `.factory-snapshots/`. DR snapshot + guardrail before write-capable work.

## Full Lifecycle Checklist (implement/verify in order)

### 0. Prerequisites / Stack Hardening (from prior Codex + this plan)
- [ ] Guardrails + pre-snapshot on every project item start and phase transition (already partially in rufloui).
- [ ] Single model via LiteLLM + profiles (stopped default, safe settings surfaced in matrix).
- [ ] Hermes + RuFloUI + MCP (ruflo revelations) visible and functional.
- [ ] Provenance for all research (URL, time, hash, summary artifact).
- [ ] Dual location sync discipline (worktree / D:\UAT / revelation / decima) documented and followed.

### 1. Intake / Verbal Start (Jarvis + Planning Agent)
- [ ] Jarvis surface accepts verbal (chat) or form with presets (spec-kit templates for "secure comms app", "mobile app", "agent tool", etc.).
- [ ] Planning agent (Ruflo planner persona or Hermes skill fronting it):
  - Runs clarification dialogue (targeted questions from matrix + domain templates + past brain research).
  - Fills **Jarvis Input Matrix** (see INPUT_MATRIX.md).
  - On approval: creates project item = spec-kit/_request.md (rich), initial _spec stub, brain page, manifest.
- [ ] Gate: Matrix + request complete + user sign-off + initial context-pack + snapshot.
- [ ] Output: "research-phase" project item queued to Queen.

**Matrix fields** (spec-kit superset; see INPUT_MATRIX.md for details + security extensions for Graphene example).

### 2. Research Phase (Deep Research + Propose/Review/Gates)
- [ ] Queen routes to Researcher + domain agents (blue-team for security example).
- [ ] Activities: deep research (tools + provenance: URLs, timestamps, hashes, summaries to artifacts), source manifests, threat modeling, platform analysis, existing solutions, memory recall.
- [ ] **Propose/Review loop**:
  - Researcher proposes research_brief + source_manifest.
  - Architect/Reviewer reviews (using gates: citations present, no drift-prone facts, evidence chain).
  - Iterate (cap e.g. 3 cycles per SOUL) or escalate.
  - Update matrix/plan based on findings.
- [ ] Gates (research-specific):
  - All claims have source + fetch time + hash.
  - Context pack produced/updated.
  - Memory writes via gated research-collaboration-memory skill (namespaced).
  - Queen/Reviewer sign-off: "Research sufficient for dev phase?"
- [ ] Output: approved research artifacts + refined matrix + "architecture" handoff.

Tools/gates to wire/enforce: firecrawl-style ingestion, context-mode for packs, Qdrant + brain search, reader-writer feedback (as in memory docs), SAGE patterns.

### 3. Architecture / Planning Phase (Propose Blueprints + Review)
- [ ] Architect proposes architecture_blueprint (interfaces, boundaries, data models, security controls, deployment).
- [ ] Review by Reviewer/Queen + security agents.
- [ ] Gates: protected paths checked, alignment with matrix constraints/threat model, context pack updated, DR snapshot.
- [ ] Iterate on review outcomes.
- [ ] Output: approved blueprint + task breakdown + "ready for dev" .

### 4. Development / Engineering Phase
- [ ] Coder(s) + OpenHands execute per blueprint under guardrails (workspace allowlist, pre-write snapshots, HITL for protected).
- [ ] Tester produces validation_report (unit + matrix success criteria).
- [ ] Reviewer reviews diff + report.
- [ ] Propose/Review: code proposals reviewed before merge to branch; failures drive repair (max 3 cycles).
- [ ] Gates: write allowlist, snapshot before task, tests pass or documented, memory updated with lessons.
- [ ] Context engineering: every run uses compact pack + exact file fetches.
- [ ] Output: working implementation + reports + "ready for release" .

### 5. Production / Release Phase
- [ ] Documenter produces handoff_summary + user docs + security notes (from matrix).
- [ ] Packaging: product root with its own bin/config/docs (Factory does not absorb binaries per Architecture "Product Packaging Boundary").
- [ ] Export/Release: use/update factory-export-customer.sh, portable artifacts, checksums, customer deployment runbooks.
- [ ] Final validation: end-to-end on target platforms (GrapheneOS/iOS smoke), security properties verified per matrix.
- [ ] Gates: all prior artifacts present, brain page complete, release bundle produced, operator approval.
- [ ] Handoff: branch/PR, release notes, Factory Brain "run complete".
- [ ] Post-release: lessons -> agent growth + memory (via research-collaboration or dedicated skill).

**Release artifacts checklist**:
- Portable product tree
- Repro build instructions + hash
- Full provenance bundle (research + decisions)
- Threat model validation report (for security projects)
- Customer deployment runbook (CUSTOMER_WSL_DEPLOYMENT style)
- Brain page + timeline

## Planning Agent Mechanics (Ruflo primary, Hermes/Jarvis interactive)

- Persona: `planner` (new or sub of Queen). Follows existing server/agents/ pattern (AGENTS, SOUL, IDENTITY).
- State: clarification session + matrix draft in short-term memory or workspace/project/<run_id>/planning-state.json. Persist key turns to brain.
- Loop:
  1. Accept verbal + initial matrix stub.
  2. Ask targeted questions (use domain templates + past similar projects from brain + researcher tools).
  3. Synthesize / update matrix.
  4. On user "ready" → emit artifacts + handoff to Queen (phase=research).
- In research/dev phases: the planner (or Queen) coordinates the *propose* agents and *review* agents, records outcomes, decides gate pass or backtrack.
- Integration: reuses research-collaboration-memory for writes, fabric for model, rufloui /intake for creation.

**Example questions the agent should generate for the Graphene goal** (illustrative; agent produces dynamically):
- What does "capture of the phone" mean exactly (powered off FS dump, RAM scraping while running, evil maid, malware with root, etc.)?
- Must messages be decryptable on the device at all, or can decryption be session-only in secure enclave/TEE?
- Is any metadata (who, when, size) allowed to persist?
- Self-hosted relay OK or pure P2P required? How is discovery/auth done without central server?
- Deniability vs auditability trade-off?
- Reproducible builds required for both iOS and Graphene targets?
- ...

## Gates Summary (cross-phase)

- Pre-work DR snapshot (server/hooks/pre_work_snapshot.sh).
- Protected paths = HITL.
- Context pack required before coder or heavy research.
- Provenance + citation on all external claims.
- Matrix alignment check at phase boundaries.
- Human approval for security threat model + final release.
- Bounded correction loops (≤3 per SOUL).

## Observability & UI

- Jarvis / RuFloUI: project item list, current phase, matrix view, chat for clarification, gate results, artifact links.
- Fabric: phase status + model work orders triggered by matrix recommendation.
- Brain pages: per-run with timeline of proposes/reviews/gates.
- Hermes: planning mode chat + MCP visibility into Ruflo state for the project.

## Success Criteria (for this plan)

- Verbal Graphene goal → complete matrix → 3+ gated research iterations with recorded reviews → dev under guardrails → portable release bundle + verified security properties.
- No unproven claims in artifacts.
- All surfaces (Jarvis, Hermes, RuFloUI) see the same project item and phase.
- Context packs + memory used; raw dumps avoided.
- Checklist items above are green in a factory-doctor style check or explicit runbook.

## References & Reuse

- INPUT_MATRIX.md
- context-engineering.md (packs + rules)
- FACTORYGRID_WORKFLOW_SPEC.md (base stages)
- SPEC_KIT_QUEEN_VALIDATION.md
- server/agents/queen/SOUL + AGENTS
- rufloui factory-brain + guardrails + server intake
- Architecture.md (product boundary, topology)
- CLAUDE.md (constitution, sync, shims awareness)

Start small (matrix + basic planner stub + FactoryPanel evolution) then add phase gates and propose/review wiring.

This checklist + the agent loops turn the factory into a reliable, auditable, high-outcome product development system for even the most demanding verbal goals.
