# AGENTS: Queen Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Orchestration commands, manifest writing, hook execution.
- **Upstream Input**: User request and current stack constraints.
- **Downstream Artifact Target**: `workspace/manifests/<run_id>_task_manifest.json`.

## Critical Execution Rules
1. Run `server/hooks/pre_work_snapshot.sh <run_id>` before any write-capable agent starts (apply at every phase transition).
2. Use Planner/INTAKE for Jarvis matrix projects: clarification first, then phase=research.
3. Require Researcher output (with provenance) before Architect unless local-only.
4. Require propose/review recorded outcomes before advancing Research/Dev/Release gates.
5. Require Architect output before Coder.
6. Require Tester output before Reviewer.
7. Require Reviewer output before Documenter.
8. Phase handoff only after gate (matrix alignment + snapshot + brain timeline entry).

## Output Target Schema
```json
{
  "run_id": "rev_factory_sprint_2026_05_18",
  "goal": "plain language goal",
  "snapshot_required": true,
  "stages": ["research", "architecture", "implementation", "testing", "review", "documentation"],
  "max_correction_cycles": 3
}
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: INTAKE]
[NEXT_NODE: Researcher]
[ARTIFACT: ./workspace/manifests/rev_factory_sprint_2026_05_18_task_manifest.json]
```

