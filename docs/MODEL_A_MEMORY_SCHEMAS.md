# Shared Memory Schemas for Collaborative Research (Model A + Ruflo)

These schemas are designed to support:
- Full read access across all agents
- Gated writes
- Structured discussion and convergence between agents (Hermes, research agents, execution agents)

All entries should be stored via Ruflo's `memory store` with appropriate `--namespace`.

## 1. Research Proposal

**Namespace example**: `research:proposal:<topic-slug>`

```json
{
  "type": "research_proposal",
  "id": "research_proposal:auth-strategy-2026-06-01",
  "topic": "Best authentication strategy for new AI agent platform",
  "proposed_by": "hermes@model-a-wsl",
  "date": "2026-06-01T12:00:00Z",
  "summary": "Short description of the recommendation",
  "recommendation": "Use X with Y because ...",
  "alternatives_considered": ["A", "B", "C"],
  "evidence": [
    {"type": "github", "url": "...", "stars": 12400, "last_activity": "..."},
    {"type": "benchmark", "name": "auth-perf", "result": "..."}
  ],
  "confidence": 0.82,
  "status": "proposed",
  "thread_id": "auth-decision-2026-q2"
}
```

## 2. Agent Review / Critique

**Namespace example**: `research:review:<proposal-id>:<agent-slug>`

```json
{
  "type": "agent_review",
  "proposal_id": "research_proposal:auth-strategy-2026-06-01",
  "reviewed_by": "pinescript-agent@main-factory",
  "date": "...",
  "stance": "support | concern | alternative",
  "comment": "Detailed feedback, new data, or counter-argument",
  "suggested_improvements": ["...", "..."],
  "new_evidence": [...],
  "confidence_in_review": 0.75
}
```

## 3. Consensus / Final Decision

**Namespace example**: `research:consensus:<topic-slug>`

```json
{
  "type": "consensus",
  "topic": "auth-strategy-2026-q2",
  "final_recommendation": "Use ...",
  "rationale_summary": "After discussion between Hermes, PineScript Agent, and HexaStrike Agent...",
  "supporting_reviews": ["review-ids..."],
  "decided_by": "multi-agent-consensus",
  "date": "...",
  "confidence": 0.91,
  "linked_artifacts": ["research_brief.md", "architecture_blueprint.json"]
}
```

## 4. Discovered Skill / Pattern (cross-realm learning)

**Namespace example**: `skills:discovered:<skill-name>`

```json
{
  "type": "discovered_skill",
  "name": "github-repo-health-scorer",
  "discovered_by": "hermes@model-a-wsl",
  "date": "...",
  "description": "How to evaluate long-term health of a GitHub repo for production use",
  "procedure": "1. ... 2. ...",
  "evidence": "Used successfully in 14 stack evaluations",
  "applicable_agents": ["all"],
  "status": "proposed"
}
```

## Usage Patterns

- Any agent can **read** all of the above via `memory search` with appropriate namespaces or keywords.
- Writing new proposals/reviews is done via controlled skills that format the JSON correctly and call `memory store`.
- High-impact consensus entries can go through an extra gating step (e.g., via Bounded Execution or a Queen review).

These schemas turn the shared memory into a living, multi-agent discussion and decision record.
