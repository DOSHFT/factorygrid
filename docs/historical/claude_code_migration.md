# Claude Code Integration & Migration Strategy for Revelation FactoryGrid

> **Current Status (June 2026)**: The Bounded Execution lane has been permanently merged into production `server.ts`. Mode A wrappers (`factory-mode-a-research.sh` + `.ps1`) have been designed, hardened, pre-flight checked, and successfully tested in dry-run mode. See Section 12 for the chosen "Artifact Forge" approach and the dedicated design doc `factorygrid_patch/docs/MODE_A_CLAUDE_CODE_ARTIFACT_FORGE.md`.

**Context**: Analysis performed May 2026 on the current Revelation / FactoryGrid stack. Updated June 2026 with implementation status.

---

## Executive Summary

Your current FactoryGrid is a sophisticated, **opinionated autonomous software factory**. It is not a standard RuFlo deployment. It has its own execution model, custom dashboard, safety layers, and (critically) its own evolving memory architecture.

**Core tension when bringing in real Claude Code**:
- Real Claude Code + upstream Ruflo is designed around **interactive human-driven sessions** + Ruflo's native memory systems (AgentDB / ReasoningBank / hive-mind, etc.).
- Your system is built around **headless autonomous orchestration** + custom RuFloUI + a memory layer that has already moved away from Qdrant as the primary store.

**Recommendation**: Do **not** attempt a deep replacement of your factory with real Claude Code. Instead, pursue a **hybrid approach** where real Claude Code acts as a high-intelligence collaborator that feeds structured, high-quality artifacts into your existing memory and execution system.

---

## 1. Recommended Integration Philosophy (Hybrid Approach)

### Do This
- Install and use **real Claude Code** (the official CLI) on the Windows host (`BlackBeast`) or inside the `revelation` distro for interactive work.
- Point it at your existing **LiteLLM** gateway (you already have an excellent central router).
- Use real Claude Code + Ruflo MCP tools selectively as a **superior researcher, architect, and planner**.
- Keep your current headless factory (`factory_ruflo` + `factory_rufloui` + workers) as the primary autonomous execution engine.
- Establish deliberate **memory handoff contracts** so that valuable work done in real Claude Code sessions ends up in your durable memory stores.

### Do Not Do This (High Risk)
- Try to make real Claude Code the primary driver of the autonomous factory.
- Rip out or deprecate the custom `factory_rufloui` dashboard and orchestration logic.
- Let Ruflo's native memory systems become a second source of truth without a clear migration/bridging strategy.

---

## 2. Detailed Review of Your Current Memory System (May 2026)

This is the most important section. You specifically asked me to look more carefully because "Qdrant was replaced."

### Declared / Legacy State (Still Visible in Source)

| Component | Location | Status |
|-----------|----------|--------|
| `factory_qdrant` container | `docker-compose.yml:7-23` | Still defined and started |
| Qdrant as memory provider | `ruflo_project/ruflo.config.js:17-25` | Still declared (`provider: "qdrant"`) with custom collections (`factory_context_index`, `factory_research_sources`, `factory_run_artifacts`) |
| Qdrant references | `factory-doctor.sh`, `factory-status.sh`, `factory-runtime.ts`, `.env.example`, old docs | Still present in checks and examples |

**Qdrant is still running in the compose stack**, but it is no longer the primary active memory system for most factory workflows.

### Actual Operational Memory Reality (What the System Actually Uses)

The custom `factory_rufloui` (your real control plane) has largely moved on:

1. **Primary Memory Path** — Ruflo CLI Memory Commands
   - The majority of memory operations in `rufloui/src/backend/server.ts` go through `execCli('memory', ...)` calls.
   - This includes: `memory stats`, `memory list`, `memory store`, `memory search`, `memory retrieve`, `memory delete`, `memory migrate`.
   - These operations use whatever the installed Ruflo v3.7 (`@claude-flow/cli` / AgentDB / ReasoningBank) uses internally — **not Qdrant**.

2. **Hive-Mind Memory**
   - Heavy use of `hive-mind memory` and `storeHiveMindMemory()` / `getHiveMindMemory()`.
   - This is Ruflo's shared swarm memory layer (separate from the main memory store).
   - Used extensively for cross-task context, agent findings, and pipeline state.

3. **In-Memory (Process) Stores** (fragile but real)
   - `taskStore`
   - `workflowStore`
   - `agentRegistry`
   - `sessionStore`
   - These live only in the Node.js process of `factory_rufloui`. They are supplemented with some JSON persistence under `.ruflo/` in the mounted `ruflo_project`.

4. **Ruflo Project Config Memory**
   - `ruflo.config.js` still points at Qdrant.
   - This configuration is honored by the `factory_ruflo` orchestrator for certain operations, but the custom RuFloUI dashboard largely bypasses it in favor of direct CLI calls + hive-mind.

### Current Memory Architecture Summary

```
Real operational memory (what actually matters day-to-day):
├── Ruflo Native Memory (via CLI)
│   ├── AgentDB / ReasoningBank stores
│   └── Hive-mind shared memory
├── Custom RuFloUI in-memory + .ruflo/ JSON persistence
│   ├── Tasks, workflows, sessions, agents
│   └── Pipeline artifacts
└── (Legacy / Niche)
    └── Qdrant (still running, still referenced in config and some scripts)
        └── Possibly used by older research ingestion paths or specific agent contracts
```

**Conclusion on "Qdrant was replaced"**: You are correct. Qdrant has been de-facto replaced as the primary memory backend for the active factory. It remains as legacy infrastructure. The real memory brain is now a hybrid of:
- Ruflo's v3 memory system (accessed via CLI)
- Hive-mind
- Custom persistence inside the rufloui Node process + mounted `.ruflo/` directory

This is actually a **stronger and more Ruflo-native** position than pure Qdrant was, but it creates complexity for any future migration or integration.

---

## 3. Risks of Introducing Real Claude Code to the Current Memory Picture

- **Memory fragmentation** is the biggest danger. Real Claude Code + Ruflo MCP will want to use Ruflo's native memory. Your factory is already partially on that path but has its own layers on top.
- The custom rufloui task/pipeline memory is not automatically visible to a standard Ruflo + Claude Code setup.
- Your agent contracts, protected gates, and durable artifact patterns (handoff_summary.md, research_brief.md, etc.) live outside standard Ruflo memory.
- Any work done in real Claude Code sessions that isn't deliberately exported will be lost to your factory's long-term retention.

---

## 4. Safe Integration Recommendations

### Phase 1 (Low Risk) — Add Real Claude Code as a Power User Tool
- Run official Claude Code on the host, pointed at your LiteLLM.
- Add Ruflo MCP server to it.
- Use it heavily for research and architecture.
- Manually or semi-automatically write high-quality outputs into your workspace in the formats your factory already expects (so your existing agents can pick them up).

### Phase 2 (Medium Risk) — Build Explicit Memory Bridges
- Create tools / commands that can:
  - Export important Claude Code + Ruflo sessions into your `factory_*` artifact formats.
  - Ingest high-value memories from Ruflo's native stores into your custom rufloui views (or vice versa).
- Decide on a "source of truth" strategy (probably Ruflo CLI memory + your custom rufloui persistence, with selective promotion to durable artifacts).

### Phase 3 (Only if it makes sense) — Deeper Integration
- Only after the memory contracts are solid would you consider having real Claude Code drive more of the factory orchestration.

---

## 5. Next Steps & Questions for You

Before we design the concrete technical migration plan, I need clarity on a few points:

1. **Memory truth**: Do you want to eventually consolidate around Ruflo's native memory system (what the CLI uses), keep your current hybrid rufloui + hive-mind approach, or bring Qdrant back as a first-class durable store?

2. **Autonomy vs Interaction**: How much of the factory do you want to remain fully autonomous (Queen-driven, minimal human input) vs how much you're willing to drive interactively with real Claude Code?

3. **Scope of integration**: Are you mainly looking to use real Claude Code for better research/planning that then feeds the factory, or do you want real Claude Code to be able to directly control/observe the running factory tasks?

4. **Pain points today**: What specifically feels painful about the current "Claude" experience (the shim) that real Claude Code would solve?

---

**This document should be treated as the living plan.** Do not make significant changes to memory-related components (especially anything touching `execCli('memory'...)`, hive-mind, or the rufloui persistence layer) without updating this file first.

Next action: Once you answer the questions above, I can produce a detailed technical migration plan with specific config changes, bridge scripts, and risk mitigations.

---

## Re-assessment After Reviewing Core Workflow Documents (May 2026)

After reading the three key documents you pointed to, my assessment has become **significantly more conservative**.

### What These Documents Reveal

**FACTORYGRID_WORKFLOW_SPEC.md**, **deployment_orchestration.md**, and **capability_matrix.md** show that your factory is not just "Ruflo with some custom agents". It is a **deliberately rigid, multi-stage, gate-enforced pipeline** with:

- A fixed 7-stage flow: Queen → Researcher → Architect → Coder → Tester → Reviewer → Documenter
- Mandatory named artifacts at every single transition (`task_manifest.json`, `research_brief.md`, `architecture_blueprint.json`, `validation_report.md`, `handoff_summary.md`, etc.)
- Explicit **Python gate hooks** between stages (`gate_architecture.py`, `gate_diff_scope.py`, `gate_validation.py`, `gate_review.py`)
- A formal **Capability Matrix** that defines not just what each agent *should* do, but what they are **explicitly blocked** from doing
- "YOLO mode" that is still heavily bounded by protected paths and required flags (`infrastructure_run=true`)
- A declared Memory Contract that requires very specific provenance fields in Qdrant records

This is a **highly opinionated, safety-first, artifact-driven** system. It is the opposite of how real Claude Code normally operates.

### Updated Risk Assessment

| Aspect | Previous View | Updated View After Docs |
|--------|---------------|-------------------------|
| **Risk of letting real Claude Code drive the factory** | High | **Very High / Structurally Incompatible** |
| **Threat to gate chain** | Moderate | **Severe** – Claude Code wants fluid long-horizon work; your system exists to *prevent* that |
| **Threat to capability boundaries** | Moderate | **Severe** – The capability matrix + blocked actions are core to your safety model |
| **Threat to artifact discipline** | Moderate | **High** – Real Claude often produces free-form output; your system requires specific named artifacts with structure |
| **Threat to memory provenance** | High | **Still High** – The documented memory contract assumes strict provenance that a generalist Claude session will not naturally produce |

### Stronger Recommendation

Real Claude Code should be treated as a **very powerful external specialist**, not as a participant inside your pipeline.

**Best fits for real Claude Code:**
- High-quality **Researcher** (deep analysis, better source evaluation than your current local model)
- High-quality **Architect** (especially complex system design and interface boundaries)
- Strong **Reviewer** (second-pass safety and design review after your internal Reviewer)
- Occasional "chaos agent" for exploring alternatives outside the main run

**Poor fits (should be avoided):**
- Replacing or bypassing the Queen
- Directly driving Coder + Tester + Reviewer loops
- Bypassing the Python gate hooks
- Becoming the primary memory writer without going through your artifact formats

### Implications for Memory

The documents still describe a **Qdrant-centric memory contract** with strict fields (`source_path`, `symbol`, `exact_excerpt`, `hash`, `run_id`, etc.). Even though operational memory has drifted toward Ruflo CLI + hive-mind + rufloui in-memory, the **architectural intent** was clearly that durable, queryable, provenance-rich memory would live in Qdrant.

This creates an additional constraint: any work produced by real Claude Code that you want to keep long-term should probably still be funneled through mechanisms that can populate Qdrant (or whatever you decide the durable store should be) with the required provenance structure.

### Revised Integration Philosophy

**Do not** try to make real Claude Code "part of the factory" in the sense of participating in the gate chain.

**Do** treat it as an extremely capable consultant that you occasionally bring in to produce excellent versions of `research_brief.md` or `architecture_blueprint.json` (or review artifacts), which are then ingested through your normal Queen/Architect/Documenter paths.

This preserves the integrity of the gated pipeline you have spent significant effort building, while still giving you access to much stronger reasoning when you need it.

---

**Bottom line after this review:**

Your factory is more deliberately constrained than I initially appreciated. The value is in the **process and the gates**, not just in having access to a strong model. Real Claude Code is best used as a tool that respects that process, rather than as something that replaces or shortcuts it.

Update the questions in Section 5 if your thinking has changed after seeing this re-assessment.

---

## 10. Honest Assessment of Where You Actually Are (Raw) — Updated with Spec-Kit Status

You just gave a very clear status report on Spec-Kit. This is useful.

### Current Spec-Kit Reality (as of your last message)

**Working well:**
- Verbal/user intake successfully creates durable artifacts.
- It produces: request, draft spec, approval checklist, and Factory Brain run page.
- Queen/swarm validation can inspect those artifacts and mark the task as completed.
- The expected full artifact chain and gates are now documented.

**Verified example:**
- Run: `20260527-spec-kit-queen-smoke-build-0a111ccb`
- Task: `task-1779871888034-2ca023`
- Marker: `QUEEN_SPEC_KIT_VALIDATION_OK`

**Not yet working end-to-end:**
- The deeper automated flow from an *approved* spec into the full gated lifecycle:
  - Heavy research
  - Architecture blueprint
  - Task breakdown
  - Implementation
  - Validation report + evidence
  - Review log
  - Memory promotion (into whatever your actual memory system is now)

You summarized it perfectly:

> "intake + artifact generation + Queen gate validation are working. The remaining work is turning the draft spec into a real orchestrated lifecycle."

This is a much more precise picture than "shit doesn't work yet." The front door is real. The engine behind it is still partial.

---

## 11. What This Actually Means for Your Vision

Your north star is:

> Verbal idea (via Spec-Kit) → very heavy autonomous research → finds THE BEST solution → builds and validates it with high autonomy, because you can't code.

Right now you have built a **solid intake + validation gate** (Spec-Kit → Queen validation). That's non-trivial progress.

What you do **not** have yet is the "very heavy research" and "orchestrated execution with guardrails" part working reliably at scale.

This changes the priority discussion around Claude Code integration significantly.

---

## 12. Chosen Path (June 2026) — Mode A Claude Code Artifact Forge

After full research and design work, the decision is:

**Use the official `claude` CLI (Anthropic's Claude Code) strictly as an external "Mode A Research Specialist"** that produces high-quality artifacts in your exact existing formats, then feeds them through the normal Spec-Kit → Queen → gates → Bounded Execution path.

### Key Decisions
- **Model**: Local only. Primary = Qwen3.6-35B-A3B (MoE) Q5_K_M on the RTX 4090 via vLLM + LiteLLM.
- **Integration style**: Thin, heavily constrained wrapper scripts (`factory-mode-a-research.sh` / `.ps1`) only.
- **Safety model**: The `claude` process gets its own isolated directory + read-only view of the factory + a strict output contract. It never touches live state or memory directly.
- **No changes** to `server.ts`, core Ruflo, Docker services, or existing memory systems for the initial rollout.

### Delivered Artifacts (as of 2026-06-01)
- `factorygrid_patch/docs/MODE_A_CLAUDE_CODE_ARTIFACT_FORGE.md` — Full production design + rationale + risk register.
- `factorygrid_patch/bin/factory-mode-a-research.sh` + `.ps1` — Production wrappers with `--dry-run` support.
- `factorygrid_patch/docs/litellm-mode-a-config.example.yaml` — Exact LiteLLM addition needed.
- `workspace/research-incoming/MODE_A_SYSTEM_PROMPT.md` — Strict output contract prompt.
- This section in `claude_code_migration.md`.

This is the lowest-risk, highest-leverage way to get dramatically better research input while fully respecting the gated philosophy and all previous work (especially the Bounded Execution Phase 0 merge).

Implementation will continue in small, reviewable chunks only.

### The Core Problem

You didn't just customize Ruflo. You built a **very ambitious, multi-layered autonomous research + gated execution factory** on top of it, while simultaneously building a custom dashboard (rufloui) and a custom headless execution layer (the shim + task system + hooks).

That is an extremely large surface area. It's not surprising that many pieces aren't working smoothly yet.

The spec-kit integration / gate you mentioned is a perfect example. That piece is foundational to your ultimate vision ("take my verbal ideas via spec-kit"), and if it's not solid, the whole downstream pipeline suffers.

### The Real Risk You Are Feeling

You're worried that by going this deep into customizations, you've created a system that is:
- Too broken to deliver value today
- Too customized to benefit from upstream improvements in either Ruflo or Claude Code
- Dependent on you (who "cant code for shit") to finish building and maintaining it

That fear is valid.

---

## 11. Your North Star Vision (Clearly Stated)

You want this:

> A software development factory that takes my verbal ideas (via spec-kit) → does very heavy research autonomously → finds THE BEST software solution → builds and validates it with minimal input from me, because I can't code.

This is an extremely high bar. Most people who say they want "an autonomous coding factory" actually want something much weaker. You're describing something closer to a **research-driven autonomous product development system**.

This vision has two extremely hard parts:

1. **Heavy autonomous research** that actually finds *the best* solutions (not just hallucinated or mediocre ones). This is where real Claude Code (or even stronger models) can help enormously.
2. **Reliable gated execution** that can take those researched specs and turn them into working software without you having to fix everything manually. This is where your current custom gated pipeline (Queen + Python gates + artifacts) is trying to provide safety.

The tension is real: The more you constrain the execution side for safety (your gates), the harder it becomes to let a powerful model just "go build stuff."

---

## 12. How Real Claude Code Integration Can Actually Help (Despite the Customizations)

You said something hopeful:

> "If Ruflo comes up with new updates AI can figure out how to integrate critical / important codes"

This is partially true, and partially cope. Let's be precise.

### What Real Claude Code Can Realistically Help With

- **Much better research quality** in the early stages (this is the biggest win for your vision).
- Better architecture decisions when producing `architecture_blueprint.json`.
- Stronger reviews.
- Helping you **repair and evolve** your custom layers over time (this is where your hope is most valid).
- Acting as a translator when you want to pull in useful pieces from future Ruflo releases without doing a full upgrade.

### What It Cannot Magically Fix

- The fundamental complexity and partial brokenness of your current custom stack.
- The fact that your rufloui + gates + shim + task system form a large bespoke system that needs ongoing care.
- The difficulty of making the "heavy research → best possible solution" loop actually reliable and not just impressive on the first try.

---

## 13. Re-assessment After Your Spec-Kit Status Update (Most Important Section Right Now)

You gave a very clear status. This changes the conversation.

### Accurate Current State of Spec-Kit

**Working:**
- Verbal intake → durable artifacts (request, draft spec, approval checklist, Factory Brain run page)
- Queen can validate those artifacts exist and complete the intake task
- The expected artifact chain and gates are documented

**Not working end-to-end yet:**
- The actual orchestrated lifecycle after an approved spec:
  - Heavy research
  - Architecture blueprint
  - Task breakdown
  - Implementation through the gates
  - Validation report with real evidence
  - Review log
  - Memory promotion

You have a **functional front door + first governance gate**.  
You do **not** yet have a reliable "heavy research + execution engine" behind it.

This is a classic (and dangerous) intermediate state when building these kinds of systems.

### Implications for Your Vision and Claude Code Integration

1. **Your biggest current weakness is research depth**, not just execution.
   Your vision explicitly requires "very heavy research to find THE BEST software solution." The part of the pipeline that should do this research is still incomplete. This is exactly where real Claude Code can give you the highest immediate leverage.

2. **Spec-Kit + Queen validation is now your strongest asset.**
   Do not bypass or weaken this. Any integration with real Claude Code should feed *into* this intake mechanism (or at least produce artifacts it understands), not around it.

3. **The "I heavily customized myself into a corner" feeling is justified.**
   Because the core research + execution pipeline is still being built on top of heavy customizations, you are carrying both the customization debt *and* the incomplete implementation burden at the same time. This is why it feels stuck.

4. **Claude Code as "research engine + integration helper" is now the clearest short-term win.**
   Use real Claude Code (on Windows, Mode A style) to:
   - Take draft specs from Spec-Kit
   - Do the heavy research your current setup can't do well
   - Produce high-quality `research_brief.md` + architecture direction
   - Feed those back into the artifacts your Queen already knows how to validate
   - Later, use it to help you implement the missing pieces of the pipeline in a way that respects your gates and contracts

This is more valuable right now than trying to make the current incomplete execution pipeline fully autonomous.

---

**Decision locked in.**

You chose **#1**: Get real Claude Code doing excellent research from Spec-Kit draft specs, with outputs feeding back into your artifact/gate structure.

Below is the concrete implementation plan.

---

## 14. Concrete Plan: Real Claude Code as the Research Engine for Spec-Kit (Mode A Research)

### Architecture Principles (Non-Negotiable)

- Real Claude Code runs primarily on **Windows (BlackBeast)** — this is where you think and direct it.
- Revelation/FactoryGrid remains the execution environment (models, LiteLLM, gates, workers, rufloui).
- Real Claude Code **never** bypasses your gates or directly edits code in production runs.
- It only produces research artifacts that are ingested through the existing (or lightly extended) Spec-Kit + Queen validation path.
- This directly attacks the biggest gap in your vision: high-quality, heavy research from verbal ideas.

### Phase 1 Goal (First Usable Value)

From an approved Spec-Kit draft spec → high-quality `research_brief.md` (plus supporting evidence) produced by real Claude Code → written back into the run's artifact folder in a format your Queen/gates can recognize and continue processing.

### Step-by-Step Implementation

**Step 1: Workspace Visibility from Windows**
- Use the WSL path from Windows: `\\wsl$\revelation\home\revelation\factorygrid\workspace`
- (Optional but recommended) Create a convenient mapped drive or symlink on BlackBeast for easier navigation in Claude Code.

**Step 2: Define the Research Artifact Contract**
We need to decide exactly what a "good" research output looks like for your factory.

I recommend we define at minimum:
- `research_brief.md` (main deliverable)
- `source_manifest.json` (with citations, dates, hashes where possible)
- Optional but valuable: competing solutions analysis, risk/tradeoff matrix, open questions/assumptions for the Architect stage.

Would you like me to draft a detailed schema for `research_brief.md` based on your existing capability matrix, gates, and workflow spec?

**Step 3: Create the "Mode A Research Specialist" Prompt**
This is the most important piece for quality.

The prompt must be extremely strict:
- Role: Research Specialist operating under Factory Mode A constraints.
- Only output in the defined artifact formats.
- Extremely evidence-based and citation-heavy.
- No code writing, no implementation details yet.
- Must respect your provenance and documentation standards.

I can draft the first version of this prompt as soon as you confirm the artifact schema.

**Step 4: Simple Launcher on Windows (Initial Version)**
Create a small wrapper (PowerShell or Node) on BlackBeast, e.g.:

```powershell
claude-research --run 20260527-spec-kit-xxx
```

This wrapper will:
- Load the strict Mode A research prompt
- Give Claude Code the path to the current draft spec + existing artifacts for that run
- Set the working directory to the run folder
- Launch real Claude Code with the right context

This makes it feel like a deliberate "Research task" rather than ad-hoc chatting.

**Step 5: Handoff Back into the Factory**
For the first version, this can be manual:
- After Claude Code finishes, you (or a simple script) move/copy the `research_brief.md` + supporting files into the expected location for that run.
- Then trigger the next stage in your rufloui or via Queen (e.g., "Research complete – proceed to Architecture gate").

Later we can make this more automatic (e.g., a "Research Requested" status that the Queen understands, or a narrow API the Windows side can call).

---

### My Recommendation on Order of Work

1. Define the exact `research_brief.md` schema + any required supporting files (I can draft this).
2. Write the strict Mode A Research prompt (I can draft this).
3. Build the first Windows launcher script.
4. Do an end-to-end test with one of your existing draft specs.
5. Iterate on quality and format until the output is genuinely useful for the downstream gates.

---

## Current Active Workstream: #1 - Real Claude Code as Spec-Kit Research Engine

**Decision (2026-05-28):** Prioritize getting real Claude Code (on Windows) to perform high-quality research from Spec-Kit draft specs and feed structured artifacts back into the existing gated factory pipeline.

### Why This First
- Spec-Kit intake + Queen validation is the only reliably working part of the "verbal idea → execution" flow.
- The biggest gap in the user's vision ("very heavy research to find THE BEST solution") is currently limited by local model quality.
- This approach respects all existing custom gates, contracts, and the Spec-Kit + Queen front door instead of fighting the customizations.
- Real Claude Code's superior reasoning can immediately improve research depth while we continue maturing the execution side.

### High-Level Plan
- Real Claude Code runs on BlackBeast (Windows host).
- Operates in strict **Mode A Research Specialist** mode only.
- Produces `research_brief.md` + supporting evidence files in formats the factory gates already expect.
- Artifacts are placed in the run's folder and ingested through the normal Queen/gate process (initially semi-manual handoff, automatable later).

### Immediate Next Actions
1. Define the exact `research_brief.md` schema and any required companion files (e.g. source_manifest.json, options analysis).
2. Write the strict "Mode A Research Specialist" system prompt / Claude Code project rules.
3. Build the first Windows launcher (`claude-research --run <id>`).
4. End-to-end test with an existing Spec-Kit draft.
5. Refine until outputs are high enough quality to be useful downstream.

This workstream is now documented here and takes priority for integration efforts. The shim improvement discussion is deferred until this research loop is delivering value.

---

**Ready to start producing artifacts.**

Tell me:

- Do you want me to first draft the **research_brief.md schema** (including what fields/sections it should contain to be valuable for your Architect + Coder stages)?
- Or do you have strong opinions on the schema already?

Once we have that, I'll produce the corresponding strict system prompt.

This is the focused path to get #1 delivering real value. Let's build it.

---

## 13. Strategic Path Forward (Given Your Actual Situation)

Given that:
- The factory isn't fully working yet
- You've heavily customized Ruflo
- You can't code well yourself
- Your ultimate goal is high-autonomy research + execution from verbal ideas

Here is a more sober recommended direction:

**Stop trying to make the current headless factory "perfect" in one go.**

Instead, use real Claude Code (on Windows, via Mode A) as your **primary way of doing high-quality work** for the next 3–6 months, while using the factory more as a **structured execution and validation environment** for the outputs that Claude Code produces.

In other words:

- Let real Claude Code (with your local models through LiteLLM) do the heavy research and thinking.
- Have it produce excellent, structured artifacts in the formats your gates expect.
- Feed those into the gated pipeline (Mode A) so the safety mechanisms still run.
- Use the factory more for "take this high-quality spec/blueprint and turn it into implemented, tested, reviewed code with guardrails."
- Over time, improve the shim only in the areas that actually hurt (we'll get to that next).

This way you get the reasoning power you want *now*, while still protecting the safety architecture you already invested in.

This is probably more valuable than trying to make the current broken-ish autonomous system fully autonomous before it can do good research.

---

Would you like me to write a new section in the document that outlines a **revised 6-month strategy** based on this honest assessment? Something like:

- How to use real Claude Code as your main research + design engine immediately
- How to evolve the "spec-kit" intake so it becomes the real front door
- Where to focus limited energy on fixing the factory (vs where to deprioritize)
- A realistic path for gradually making the execution side more autonomous without needing to be a strong coder yourself

Or do you want to first talk more about the spec-kit piece specifically, since you called it out as one of the non-working functions?

I'm here. Talk to me.

---

## 6. Dual-Mode Strategy: Mode A vs Mode B (Concrete Proposal)

Your proposed split is one of the better ideas I've seen for this situation. It directly acknowledges the reality you've created.

### Refined Version of Your Idea

**Mode A — "Gated Factory Submission" (The disciplined path)**
- Real Claude Code is used as a **very high-quality specialist** (Researcher, Architect, or Reviewer).
- It is **not** allowed to directly edit code in the main workspace in an unconstrained way.
- Instead, it produces structured artifacts (or a formal "Work Order") that are submitted into your existing Queen + gate pipeline.
- The full gate chain, capability matrix, protected path checks, and artifact discipline remain fully in force.
- The factory (your current `factory_ruflo` + `factory_rufloui` + Python gates) does the actual execution.

**Mode B — "Freeform High-Intelligence Work" (The exploratory path)**
- Real Claude Code runs normally (on the host, pointed at your LiteLLM).
- It can use Ruflo MCP tools freely.
- It can explore, prototype, research deeply, or work on things outside the current factory run.
- Output from Mode B is treated as **input material** for future Mode A runs, not as direct execution.

This is a clean separation of concerns.

### Critical Acknowledgment: You Are Now Forked

You are correct to call this out explicitly.

Because of the depth of customization (custom rufloui, custom agent contracts + Python gates, custom shim, custom memory handling, custom rufloui task/pipeline system, protected edit machinery, host control, etc.), **clean upstream Ruflo upgrades are effectively off the table** for the core factory behavior.

Any future "upgrade" will mostly mean:
- Updating the base Ruflo version inside containers for specific CLI commands you still rely on.
- Manually porting useful new Ruflo features into your custom layers.
- Or deciding that certain new Ruflo capabilities are not worth the integration cost.

The same applies to the shim. The `factory-claude-local.mjs` is now part of your core IP for headless operation. Replacing it cleanly while preserving Mode A discipline is non-trivial.

---

## 7. Concrete Technical Proposal for Mode A (Work Order Submission)

### Core Design Principle

Real Claude Code should **never** be the thing that directly triggers `Coder` or runs inside the main gated execution loop for production work.

Instead:

1. Real Claude Code produces one or more high-quality artifacts in the exact formats your pipeline already expects.
2. These are placed in a well-known "incoming work orders" location.
3. Your existing Queen (or a thin new intake mechanism) picks them up, validates them, creates a proper `task_manifest.json`, and routes them through the normal gate chain.

### Proposed Work Order Format

Create a new artifact type called `work_order.md` (or `work_order.json` + supporting files).

Example structure for a Research + Architecture Work Order:

```markdown
# Work Order: <slug>

**Mode**: A
**Submitted By**: real-claude-code
**Target Run ID**: (optional - Queen can generate)
**Specialist Role**: Researcher + Architect

## Objective
<clear one-paragraph goal>

## Constraints
- ...

## Research Brief
<full high-quality research_brief.md content here, or reference to file>

## Proposed Architecture Blueprint
<full architecture_blueprint.json content here, or reference to file>

## Recommended Next Action
- Create new factory run
- Route to Architect gate (or skip to Coder if blueprint already approved)
```

The Queen (or a new lightweight "Work Order Intake" agent) would:
- Parse the work order.
- Run the appropriate validation.
- Either create a full `task_manifest.json` or augment an existing one.
- Trigger the normal pipeline with the high-quality artifacts already populated.

This gives you the intelligence upgrade from real Claude Code **without** destroying the gate chain.

### How to Invoke Real Claude Code in Mode A

Create a small launcher script on the host (e.g. `bin/claude-mode-a.sh` or a Node script).

Example flow:

```bash
# On the Windows host or inside revelation
claude-mode-a "Improve the memory ingestion pipeline for research artifacts"

# This does:
# 1. Launches real claude with a very strict system prompt
# 2. Gives it read access to the current workspace + previous artifacts
# 3. Forces it to output only in the Work Order + artifact formats
# 4. Saves everything under workspace/.incoming-work-orders/<timestamp>/
# 5. Optionally triggers the factory intake
```

The system prompt for Mode A must be extremely directive (examples can live in `claude_mode_a_prompts/`).

This is how you get the benefit of real Claude Code's improved reasoning/tool use without letting it bypass your governance.

### Shim Replacement Strategy (Longer Term)

You don't need to "fully replace" the shim overnight. You can de-risk it over time:

**Phase 1 (Now)**
- Keep the shim for pure headless / scheduled / multi-run factory work.
- Use real Claude Code exclusively via Mode A launchers for high-quality input.

**Phase 2**
- For workloads where you want the best possible tool use and reasoning, run real Claude Code on the host in Mode B, then feed the best outputs into Mode A submissions.
- Gradually improve the quality of artifacts your factory receives.

**Phase 3 (Optional)**
- Only if it proves valuable: Build a more sophisticated "Claude Code as Headless Specialist" wrapper that can be invoked from inside the factory for specific stages (e.g., "run Mode A Researcher on this manifest").
- This is still not the same as letting the real `claude` binary become the orchestrator.

**Important reality check**: Real Claude Code is not designed to be a headless, long-running, multi-agent orchestrator inside Docker the way your current Queen + workers are. Using it that way would likely be more fragile than your current shim in many scenarios. The shim's narrow purpose (headless, controlled, local-model tool loop) is actually a reasonable fit for what you're doing.

---

## 8. Implementation Sketch (Practical Next Steps)

1. **Create the Mode A contract**
   - Define the exact `work_order.md` + supporting artifact schema.
   - Write the strict system prompt(s) for real Claude Code when operating in Mode A.
   - Build a small intake script that the Queen (or a new lightweight agent) can call.

2. **Build the launcher**
   - `bin/claude-mode-a` (or PowerShell equivalent on Windows host).
   - It should set up the right context, force output formats, and deposit artifacts in a predictable location.

3. **Memory handoff for Mode A outputs**
   - Decide how Work Order artifacts get provenance recorded (into Ruflo memory? into Qdrant? both?).
   - This is where your earlier memory fragmentation risk is highest — be explicit.

4. **Guardrails**
   - Mode A submissions should still go through at least a lightweight "Architect Gate" review (even if the architecture came from real Claude Code).
   - Never allow Mode A to directly write to protected paths.

5. **Documentation**
   - Update `FACTORYGRID_WORKFLOW_SPEC.md` to officially recognize Mode A submissions as a valid Intake path.

---

## 9. My Honest Thoughts on Your Proposal

Your Mode A / Mode B split is smart. It is one of the few ways to get the real benefits of modern Claude Code without completely burning down the governance system you've built.

However, be realistic on two fronts:

1. **The shim is not as bad as it feels** for pure headless execution. The real win from real Claude Code is better *thinking*, not necessarily better headless tool-loop execution. You may end up in a permanent hybrid state (real Claude Code for intelligence, shim or improved local agent for headless execution).

2. **Mode A requires discipline from you as the operator.** It will be tempting to just let real Claude Code go wild in Mode B and then manually copy-paste things. The value only compounds if you treat Mode A submissions seriously (structured, reviewed, provenance-rich).

Would you like me to draft the actual artifacts for the next layer:
- A starter `work_order.md` schema + validation rules?
- A draft system prompt for "Claude Code operating as Mode A Researcher/Architect"?
- A skeleton for the intake script that the Queen could call?

Or do you want to first refine the philosophy (e.g. how much review should a Mode A submission still require before entering the pipeline)?

This is now the most important strategic decision for the long-term health of the Revelation stack.