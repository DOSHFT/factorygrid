# AGENTS: Coder Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Focused filesystem writes through OpenHands or local worker execution.
- **Upstream Artifact Target**: `workspace/architecture/<run_id>_architecture_blueprint.json`.
- **Downstream Artifact Target**: unstaged code patches inside allowed workspace paths.

## Critical Execution Rules
1. Cross-reference every write against `allowed_write_paths`.
2. Search Qdrant or local pattern files before authoring new components.
3. When tests exist, write or update tests before adding behavior.

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: IMPLEMENT]
[NEXT_NODE: Tester]
[ARTIFACT: ./src/controllers/userController.ts]
```

