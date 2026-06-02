# Skill: Research Collaboration via Shared Memory

**Name**: research-collaboration-memory  
**Version**: 0.1  
**Purpose**: Allow Hermes (and delegated agents) in the Model A WSL to post research proposals, reviews, and findings into the shared Ruflo memory system so that all agents (research + execution) can read, discuss, and converge on the best options.

## When to Use

- After completing a piece of deep research on technologies, libraries, or stacks.
- When you want to solicit feedback or alternatives from other agents (PineScript Agent, HexaStrike Agent, etc.).
- When synthesizing multiple viewpoints into a recommendation.

## Inputs

- `topic`: Short slug for the research area
- `proposal_summary`: Clear recommendation
- `evidence`: List of sources, benchmarks, repos, etc.
- `confidence`: 0-1 float
- `action`: "propose" | "review" | "consensus"

## Procedure

1. Format the entry according to the standard schemas (see `MODEL_A_MEMORY_SCHEMAS.md`).
2. Determine the correct namespace:
   - Proposals → `research:proposal:<topic>`
   - Reviews → `research:review:<proposal-id>:<your-agent-name>`
   - Consensus → `research:consensus:<topic>`
3. Call the Ruflo memory CLI (or MCP tool) to store the structured JSON.
4. Optionally notify relevant agents or post a lightweight reference in hive-mind memory.

## Example CLI Call (from within the agent)

```bash
ruflo memory store '{
  "type": "research_proposal",
  "id": "research_proposal:vector-db-2026",
  "topic": "Best vector database for agent memory in 2026",
  "proposed_by": "hermes@model-a-wsl",
  ...
}' --namespace "research:proposal:vector-db-2026" --key "proposal-001"
```

## Gating Note

This skill should be configured to use the factory's gated write mechanisms when storing high-impact decisions (e.g., route through Bounded Execution or require explicit approval for "consensus" entries).

## Related Skills

- `research-synthesis`
- `memory-search-across-realms`
- `agent-discussion-facilitator`

This skill enables the collaborative "discuss until best is found" behavior requested by the user.
