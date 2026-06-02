# Alignment Report: Revelation FactoryGrid Stack

**Date:** 2026-05-28 (original)  
**Last Updated:** 2026-06-01  
**Author:** Grok analysis based on live system behavior + code review  
**Purpose:** Identify and document the major misalignments between the intended architecture, documented design, running implementation, and the user's long-term vision.

> **Resolution Note (June 2026)**: The core execution misalignment ("LLM describes actions instead of performing deterministic side-effects") has been addressed by the permanent production merge of Bounded Execution Phase 0 into `RuFloUI/src/backend/server.ts`, including classification, guards, and strict evidence requirements (`hasCompletedExecutionEvidence`). Mode A research capability has also been designed and implemented via hardened wrappers. Many of the issues described below are now mitigated or in active remediation.

---

## Executive Summary

The Revelation FactoryGrid has reached a critical intermediate state with several deep misalignments. 

The system has a **strong conceptual and governance layer** (Spec-Kit intake + Queen validation + documented gates and capability matrix) but a **weak and divergent execution layer**. The actual running code (particularly in the custom RuFloUI backend) frequently bypasses or ignores the narrow, evidence-based agent roles defined in the documentation. 

This creates a situation where:
- Verbal ideas can enter the system reliably.
- Heavy autonomous research (the user's highest-priority gap) is still weak.
- Reliable tool execution and gated workflows are not yet trustworthy.
- The heavy customizations have created significant technical debt that makes clean integration with real Claude Code or future upstream Ruflo improvements difficult.

The live file-write/readback test (task-1779997058737-56d85d) provided the clearest evidence yet: the model path prefers describing actions over executing them.

---

## Major Areas of Misalignment

### 1. Documented Agent Roles vs Actual Execution Behavior

**Documented (capability_matrix.md + gate chain + workflow spec):**
- Strict, narrow roles with explicit **Allowed vs Blocked** capabilities.
- Researcher: Only current-source evidence, source manifests, summaries. Blocked from writing code.
- Coder: Write only allowed paths, produce small diffs + local test evidence.
- Explicit Python gates (`gate_architecture.py`, `gate_diff_scope.py`, etc.) between every stage.
- YOLO mode is still bounded by evidence requirements.

**Reality (server.ts + current task pipeline + live test):**
- The RuFloUI backend frequently allows the local model to perform broad exploration, codebase analysis, or chain-of-thought instead of forced narrow execution.
- In the recent real worker test, the model spent 10 attempts doing research/exploration instead of writing and verifying a simple file.
- The task orchestration layer does not yet have strong enough classification + forced executor paths for concrete jobs.

**Gap:** The governance documentation describes a disciplined, role-constrained system. The running execution engine behaves more like a general-purpose LLM planner.

### 2. Spec-Kit Front Door vs Downstream Engine

**Current State (confirmed by user):**
- Verbal/user intake → durable artifacts (request, draft spec, approval checklist, Factory Brain run page) **works**.
- Queen/swarm validation of intake artifacts **works** (`QUEEN_SPEC_KIT_VALIDATION_OK`).
- The deeper automated flow (approved spec → heavy research → architecture blueprint → task breakdown → execution with evidence → review → memory promotion) is **not fully automated** and is currently unreliable at the execution layer.

**Misalignment:**
- The intake + governance checkpoint is relatively mature.
- The "engine" that should turn approved specifications into high-quality, evidence-backed work is still in an early/incomplete state.
- This creates a lopsided system where good ideas enter but high-autonomy, high-quality output is not yet reliable.

### 3. Custom RuFloUI Backend vs Intended Gated Pipeline

**server.ts** (the actual running control plane) has become a complex hybrid system that:
- Makes heavy use of Ruflo CLI primitives (`memory`, `hive-mind`, `swarm`, etc.).
- Maintains significant in-memory state (taskStore, workflowStore, agentRegistry, sessionStore).
- Layers its own orchestration logic on top of Ruflo.
- Still depends on the fragile `factory-claude-local.mjs` shim for headless execution.

This has diverged from the cleaner, more declarative gated pipeline described in the agent contracts and capability matrix.

**Consequence:** Changes to improve execution reliability (such as the planned "bounded local executor" patch) must now be made against a large bespoke codebase rather than a thin integration layer.

### 4. Memory Architecture: Declared vs Operational

**Declared:**
- `ruflo_project/ruflo.config.js` and `docker-compose.yml` still specify Qdrant as the memory provider with specific collections.
- Many older scripts, doctor checks, and docs still reference Qdrant heavily.

**Operational Reality:**
- The custom RuFloUI primarily uses Ruflo's native memory commands (`execCli('memory', ...)`), hive-mind shared memory, and in-process stores.
- Some persistence goes to `.ruflo/` JSON files.
- Qdrant exists but is largely legacy for the active task and pipeline flows.

**Impact:** This creates uncertainty about provenance, durability, and how research artifacts from real Claude Code should be persisted long-term.

### 5. Claude Code / Shim Integration Strategy vs Current Execution Reliability

**Vision (user):**
- Use real Claude Code (superior reasoning) for heavy research via a disciplined **Mode A** path.
- Preserve the gated, evidence-based execution system for actual work.

**Current Constraint:**
- The execution layer (as proven by the live test) is not yet trustworthy enough to reliably act on high-quality research inputs.
- The existing shim is a minimal pseudo-tool-calling hack that frequently allows the model to describe rather than execute.

**Misalignment:** There is a desire to bring in a much stronger reasoning model for research, but the downstream system that must consume that research is still fragile at the basic execution level.

### 6. Customization Debt vs Upgradability & External Integration

- The combination of custom `rufloui`, custom agent contracts + Python gates, custom task/pipeline logic in server.ts, custom shim, and custom memory handling has created a hard fork.
- Clean upgrades from upstream Ruflo are effectively off the table for core behavior.
- Integrating real Claude Code (or future Ruflo improvements) now requires careful bridging work rather than natural composition.

This debt amplifies every other misalignment.

### 7. Documentation vs Running System

Multiple high-quality design documents (`capability_matrix.md`, `FACTORYGRID_WORKFLOW_SPEC.md`, `deployment_orchestration.md`, agent contracts with AGENTS.md/IDENTITY.md/SOUL.md, gate README) describe an aspirational, well-governed system.

The actual behavior (especially in `server.ts` and the current shim) has drifted from these documents. `RUFLO_AGENT_READINESS.md` does not yet exist on disk (as of latest searches), leaving a gap in formally defining what "ready" means for the custom agents under real execution conditions.

---

## Root Causes

1. **Ambitious Scope + Iterative Implementation** — Building intake/governance and execution simultaneously while also heavily customizing the underlying Ruflo platform.
2. **LLM-as-Planner Default** — The current task pipeline and shim were not strict enough to force narrow execution roles for concrete jobs.
3. **Lack of Forced Executor Paths** — No strong classification layer that routes explicit file/system jobs to a bounded executor before LLM planning.
4. **Documentation Lag** — The formal role/gate definitions have not kept pace with runtime changes and new components (Spec-Kit).
5. **Shim Limitations** — The custom `factory-claude-local.mjs` was a necessary hack for headless operation but lacks the robustness of real tool-use loops.

---

## Impact on the User's Vision

The user's north star is clear:

> Verbal ideas (via Spec-Kit) → very heavy autonomous research → finds *the best* software solution → reliable execution and validation with high autonomy (because "I can't code for shit").

**Current State vs Vision:**

- **Intake:** Good progress (Spec-Kit + Queen validation).
- **Heavy Research:** Still the weakest link (local models + current pipeline limitations). This is why real Claude Code integration (#1 priority) is strategically correct.
- **Reliable Execution:** Not yet trustworthy (proven by live test). The planned task layer patch is necessary before the rest of the vision can scale.
- **Overall Autonomy:** Currently low. The system can accept ideas and perform some validation, but the research depth and execution reliability required for true hands-off operation are not present.

---

## Recommended Alignment Priorities (in rough order)

1. **Stabilize Execution Reliability** (the patch you described)
   - Add explicit bounded local executor paths for concrete jobs.
   - Ensure full Queen/Coder/Tester/Reviewer evidence loops are produced.
   - Align the implementation with the spirit of `capability_matrix.md`.

2. **Define the Research Contract**
   - Create `research_brief.md` schema + supporting artifacts.
   - Write the strict Mode A Research Specialist prompt for real Claude Code.
   - Build the Windows launcher and handoff mechanism.

3. **Create `RUFLO_AGENT_READINESS.md`**
   - Formalize what "ready" means for the custom agents and gates under real execution + real Claude Code research inputs.

4. **Reconcile Memory**
   - Decide and document the authoritative memory strategy (Ruflo native + hive-mind vs Qdrant vs hybrid) and how external research artifacts will be promoted.

5. **Reduce Documentation Drift**
   - Update or version the key design documents (`capability_matrix.md`, workflow spec, etc.) to reflect the current hybrid reality while preserving the long-term governance intent.

---

## Conclusion

The stack is not fundamentally broken, but it is **significantly out of alignment** between its documented governance model, its actual runtime behavior, and the user's ambitious vision.

The good news is that the misalignments are now clearly visible (especially after the live execution test). The work to close these gaps (particularly the execution patch + disciplined real Claude Code research integration) is well-scoped and directly addresses the highest-priority needs.

This document should be treated as a living reference. It will be most useful if updated whenever major patches are made to the task layer or when new components (such as the Mode A research path) are introduced.

---

*Generated 2026-05-28 based on code review, live test data, and ongoing strategic discussion.*