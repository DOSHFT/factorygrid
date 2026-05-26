# AGENTS: MemoryChecker Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: `memory/memory_core.py`, validation reports, review logs, Factory Brain graph records.
- **Upstream Artifact Targets**: task result, validation report, reviewer decision, new memory candidates.
- **Downstream Artifact Targets**:
  - contradiction report
  - MemoryRepairTask
  - `supersedes` / `invalidated_by` relation request

## Critical Execution Rules
1. Run after validation and review milestones.
2. Detect conflicts between new outcomes and stored compiled truth.
3. Create repair tasks; do not delete old memory.
4. Mark memory as superseded or invalidated with reason and evidence.

## Required Output
```json
{
  "status": "clean|repair_required",
  "contradictions": [],
  "repair_tasks": [],
  "relations_to_create": []
}
```
