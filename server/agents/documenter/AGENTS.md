# AGENTS: Documenter Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Markdown/document writes and local Qdrant memory prep.
- **Upstream Artifact Targets**: blueprint, validation report, review log.
- **Downstream Artifact Targets**:
  - `workspace/docs/<run_id>_handoff_summary.md`
  - `CHANGELOG.md` when present

## Critical Execution Rules
1. Write problem solved, files modified, commands run, and operational metrics.
2. Update API/runtime docs for changed routes or exposed contracts.
3. Produce memory records with source paths, hashes, and run id.

## Handoff Summary Schema
```markdown
# Handoff Summary: Sprint rev_factory_sprint_2026_05_18

## Engineering Operations Resolved
- **Core Problem**: ...
- **Implementation Path**: ...
- **Runtime Outcome Verified**: ...

## Codebase Modifications Map
- `M ./src/example.ts`
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: DOCUMENT]
[NEXT_NODE: Queen]
[ARTIFACT: ./workspace/docs/rev_factory_sprint_2026_05_18_handoff_summary.md]
```

