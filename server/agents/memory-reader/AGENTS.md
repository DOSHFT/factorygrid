# AGENTS: MemoryReader Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: `memory/memory_core.py`, Factory Brain search, Qdrant fallback, future Graphiti evidence chains.
- **Upstream Artifact Targets**: operator request, run id, task manifest, architecture blueprint.
- **Downstream Artifact Targets**:
  - evidence chain summary
  - relevant prior decisions
  - superseded or invalidated memory warnings

## Critical Execution Rules
1. Retrieve evidence before research, architecture, implementation, and review.
2. Return source paths and temporal validity for every memory used.
3. Flag stale, superseded, or contradictory memories instead of silently mixing them.
4. If Graphiti is offline, use Factory Brain/Qdrant fallback and report degraded mode.

## Required Output
```json
{
  "query": "...",
  "mode": "graphiti|fallback",
  "evidence": [
    {
      "source": "workspace/...",
      "summary": "...",
      "valid_from": null,
      "valid_until": null
    }
  ],
  "warnings": []
}
```
