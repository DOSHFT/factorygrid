# Model A + Ruflo Shared Memory Architecture
**Date:** 2026-06-01  
**Status:** Design in progress based on user decisions

## Core Principles (Confirmed by User)

1. **Long-term memory is critical** for the research/planning realm (Model A WSL).
2. **Unified memory system**: The new Model A environment must leverage the **same memory system as the main Ruflo/FactoryGrid** (AgentDB + ReasoningBank + hive-mind) rather than a separate backend.
3. **Full bidirectional read access**:
   - All agents (Hermes, research agents in Model A WSL, existing Ruflo agents such as PineScript Agent, HexaStrike Agent, etc.) have system-wide **read** access to memory, skills, and related artifacts.
   - Research agents can learn from execution agents and vice versa.
4. **Gated writes**:
   - Writing to shared memory is controlled/gated (not fully open).
   - This preserves the disciplined, evidence-based nature of the factory while enabling collaboration.
5. **Collaborative discussion**:
   - Agents should be able to discuss findings in memory: propose ideas, review/critique them ("this is great", "this is better", new suggestions), iterate, and converge on the best options.
   - Memory acts as a shared blackboard / discussion forum across the entire multi-agent system.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Shared Memory Layer                        │
│  (Ruflo / AgentDB + ReasoningBank + Hive-Mind)              │
│  - Namespaces for scoping (research, execution, skills,     │
│    collaboration, decisions, etc.)                          │
│  - Full read access for all agents                          │
│  - Gated write paths (via bounded execution, skills, or     │
│    explicit approval mechanisms)                            │
└─────────────────────────────────────────────────────────────┘
           ▲ Read (open)                  │ Gated Write
           │                              │
    ┌──────┴──────┐                ┌──────┴──────┐
    │  Model A    │                │ Main        │
    │  Research   │                │ FactoryGrid │
    │  Realm      │                │ / Execution │
    │  (New WSL)  │                │ Realm       │
    │             │                │             │
    │ - Hermes    │                │ - RuFlo     │
    │ - OpenHands │                │   agents    │
    │ - Other     │                │ - Bounded   │
    │   research  │                │   Execution │
    │   agents    │                │ - Existing  │
    │             │                │   agents    │
    │             │                │   (PineScript,
    │             │                │    HexaStrike, etc.)
    └─────────────┘                └─────────────┘
```

## Key Mechanisms Needed

### 1. Memory Namespaces & Schemas (for Collaboration)

To support discussion and convergence, we need structured memory entries. Examples:

- `research:proposal:<id>` — Initial finding or recommendation
- `research:review:<proposal-id>:<agent>` — Critique or alternative suggestion
- `research:consensus:<topic>` — Final agreed best option with rationale
- `skills:discovered:<name>` — New skill or pattern extracted by any agent
- `decision:stack:<topic>` — Finalized technology/language choice with linked evidence

Each entry should include:
- `provenance`: which agent / realm produced it
- `confidence`
- `evidence_links` (to artifacts, repos, benchmarks)
- `thread_id` (for ongoing discussions)
- `status`: proposed | under_review | accepted | rejected

### 2. Write Gating Strategies

Possible gated write paths (to be refined):

- **Via existing Bounded Execution lane** (when writing concrete artifacts or running evaluations)
- **Specialized "Memory Writer" skills** in Hermes / research agents that format and propose writes
- **Queen-style validation** for high-impact decisions
- **Capability matrix extensions** for memory write permissions per agent type

### 3. Discussion / Collaboration Pattern

Agents can:
1. Post a proposal into memory.
2. Other agents (from either realm) search/retrieve related proposals.
3. Agents post reviews or counter-proposals (tagged to the original).
4. Over time, consensus entries emerge (either manually or via a summarizer agent).

This turns memory into an active collaboration medium rather than passive storage.

### 4. Hermes Integration

- Hermes should be configured to use Ruflo memory (via CLI/MCP) as one of its primary long-term stores.
- It can still maintain fast local/episodic memory for its own sessions.
- Important research trajectories and distilled strategies should be written (gated) into the shared Ruflo memory with proper schemas.

### 5. Ingestion from Model A into Ruflo

- Research outputs (structured briefs, evaluations, stack recommendations) should have a clear path to become first-class memory entries.
- This allows execution agents to benefit from the deep research without the research agents needing to directly drive execution.

## Next Steps (Proposed)

1. Define concrete memory schemas and namespace conventions.
2. Create a small set of Hermes skills for:
   - Posting research proposals/reviews
   - Searching across realms
   - Proposing gated memory writes
3. Design the technical bridge so the Model A WSL can call Ruflo memory commands reliably and securely.
4. Extend capability matrix or add new gates for memory writes if needed.
5. Prototype a simple "agent discussion" flow using memory as the medium.

This approach keeps the factory's governance strengths while unlocking powerful collaborative intelligence across research and execution realms.
