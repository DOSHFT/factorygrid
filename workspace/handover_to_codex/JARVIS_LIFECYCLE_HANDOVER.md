# Handover to Codex: Jarvis + Full FactoryGrid Application Development Stack (Research → Dev → Release)

**Date:** 2026-06-23  
**Context:** Implementation of the approved plan from session 019e8912-f8a9-7603-8436-f2099fe40872 (review of modified_files.txt + Codex_changes.md + request for Jarvis front-end + spec-kit input matrix + planning agent + expanded solid lifecycle stack with deep research, agent propose/review/iterate + gates).

**Backup performed (DR / Principal gate satisfied):**
- Archive: `D:\UAT\factorygrid_backups\factorygrid-javris-lifecycle-backup-20260623-193352.tar`
- SHA256: 43B71C856ABAAFB7162518AE9F0B3DD7FEA6F1731BB86E71DE1BBB83E6CBDF85
- Manifest: `D:\UAT\factorygrid_backups\factorygrid-javris-lifecycle-backup-20260623-193352.manifest.json`
- Also loose copy in backup dir + worktree state at time of handover.
- Followed patterns from `bin/factory-secure-backup.sh`, `bin/factory-backup.sh`, `server/hooks/pre_work_snapshot.sh`.

**What was implemented (core of the plan):**

1. **No-bullshit assessment** (in plan.md):
   - Shims: numerous ad-hoc WSL/pwsh/rev wrappers, persistence fragile, quoting issues, sync tax.
   - RuFlo: strong queen + spec-kit + guardrails (recent Codex wins), but thin intake and P1 context-eng.
   - Hermes: good interactive verbal surface (TUI, MCP ruflo bridge, skills), recently wired to Fabric, but side-memory and shim-dependent.
   - Model Selection: excellent profiles + stable aliases + Fabric controls (Codex improved), but needs matrix-driven choice.

2. **Jarvis as front-end to the factory in total**:
   - Entry point via verbal (chat) or form with presets (spec-kit style).
   - Planning agent performs clarification dialogue.
   - Produces rich **spec-kit-type Input Matrix**.

3. **Spec-Kit Input Matrix** (`docs/jarvis/INPUT_MATRIX.md`):
   - Full schema (TS + Markdown template).
   - Covers: Core (title/vision/endGoal), Platforms & Constraints, Requirements, Security/Threat Model (critical for the example), Execution Context (recommended profile, memory namespaces), Process/Provenance.
   - Example filled for "absolute secure 1-1 communication app ... Graphene OS ... even capture of the phone prevents intruders".

4. **Planning Agent** (`server/agents/planner/`):
   - AGENTS.md, SOUL.md, IDENTITY.md (follows existing persona pattern).
   - Role: Clarification + lifecycle coordination (propose/review loops).

5. **Full Lifecycle Stack + Checklist** (`docs/jarvis/STACK_LIFECYCLE_CHECKLIST.md`):
   - Principles + explicit phases with agent propose → review → iterate + gates.
   - **Phase 1: Intake** (Jarvis + Planner → matrix → project item in research phase).
   - **Phase 2: Research** (deep research + provenance + propose/review/gates).
   - **Phase 3: Architecture**.
   - **Phase 4: Development/Engineering** (guardrails + propose-review).
   - **Phase 5: Production/Release** (portable product root, export, final validation).
   - Gates at every transition (DR snapshot, context pack, protected HITL, matrix alignment, human for security/release).
   - Observability, success criteria, reuse guidance.

6. **Code integration** (foundational changes):
   - `rufloui/src/backend/factory-brain.ts`: Added `JarvisInputMatrix` type + `createJarvisProjectFromMatrix()` (richer request + matrix.json + phase + brain page).
   - `rufloui/src/backend/server.ts`: `/intake` now supports `matrix` payload (uses new creator, sets `phase: research`).
   - `rufloui/src/frontend/api.ts` + `FactoryPanel.tsx`: Client + UI stubs for matrix path (backward compatible with old vision form).
   - `server/agents/queen/SOUL.md` + `AGENTS.md`: Updated for planning sub-state + explicit phases + propose/review mechanics.
   - `Architecture.md`: New section on Jarvis + full lifecycle.

7. **Other**:
   - `todo-factory.md`: Added P1 items for Jarvis/matrix, full gated lifecycle with propose/review, etc.
   - Backup + this handover file created as required.

**Current state:**
- Matrix and planning agent foundation in place.
- You can POST a `matrix` object to `/factory/intake` (or use the stub in FactoryPanel) and get a project item with `phase: research`.
- Planner persona exists and can be tasked.
- Lifecycle checklist and matrix doc are the "spec" for continuation.
- No new shims were introduced (reuses existing intake/brain/MCP/guardrails/Queen/spec-kit paths).

**How Codex should continue (per approved plan + checklist):**
1. Read `plan.md` (the full approved document) + `docs/jarvis/INPUT_MATRIX.md` + `docs/jarvis/STACK_LIFECYCLE_CHECKLIST.md`.
2. Start small (as noted in plan):
   - Flesh out real chat/matrix builder UI in FactoryPanel or new JarvisPanel (use the api stub).
   - Implement more of the Planning Agent logic (state machine for clarification questions, use researcher tools + memory for smart questions, especially threat model for security apps).
   - Wire Planner into Queen INTAKE (detect matrix projects, run propose/review for Research gate).
3. Follow the lifecycle checklist strictly:
   - Enforce propose → review → record outcome in brain timeline for every major artifact.
   - Emit context packs early.
   - Use gated memory writes.
   - Trigger model work-order from matrix recommendation.
4. Test with the exact example verbal goal:
   - "Build me an absolute secure 1-1 communication app that I can install on iPhones and Google Pixel 8+ running Graphene OS to ensure even the capture of the phone prevents intruders from retrieving messages"
   - Verify: planner asks good questions → complete matrix → project item → simulated research propose/review gate → advance phases → release bundle concept.
5. Update more docs (CLAUDE.md, workflow spec, runbooks) and add observability for phases.
6. Respect all gates: pre-work snapshot before heavy writes, guardrails, dual-location sync.

**Open / next items (from plan + todo):**
- Real multi-turn planning dialogue in UI (currently stub).
- Full phase status tracking + UI visibility.
- Deeper integration of propose/review loops in Queen + agents.
- End-to-end live test (requires revelation stack up + rufloui).
- Polish: types, error handling, more domain templates in matrix.
- Sync worktree ↔ D:\UAT ↔ revelation/decima after changes.
- Add to factory-doctor or a new "lifecycle doctor" check.

**Key files to focus on:**
- `docs/jarvis/*`
- `server/agents/planner/*`
- `rufloui/src/backend/factory-brain.ts` + `server.ts`
- `rufloui/src/frontend/pages/FactoryPanel.tsx`
- `server/agents/queen/*`
- `Architecture.md`
- `workspace/handover_to_codex/JARVIS_LIFECYCLE_HANDOVER.md` (this file)
- The main `plan.md` in the session dir.

**Gotchas / reminders (from CLAUDE.md + plan):**
- Dual locations critical — always sync after structural changes.
- Prefer existing MCP (revelations-ruflo), skills, guardrails.
- No cloud. Local models only.
- DR-first: snapshot before YOLO on a project item.
- Quotations in WSL/pwsh are dangerous.
- Hermes is side for memory (via skill/MCP); use it explicitly.
- Product roots stay portable — Factory orchestrates, does not absorb the final app.

**Verification so far:**
- Backup + manifest created.
- Code paths for matrix → project item (research phase) exist and are importable.
- New persona follows existing conventions.
- Docs cover assessment + matrix + full checklist.
- Architecture updated.

This handover should allow Codex (or next session) to pick up seamlessly without losing context.

**Next action for you (Codex):** Read the three key jarvis docs + plan.md, then continue with UI flesh-out or planner logic as the next small slice.

Handover complete. Backup gate passed.
