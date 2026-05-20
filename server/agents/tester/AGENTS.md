# AGENTS: Tester Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Isolated shell execution hooks.
- **Upstream Artifact Target**: blueprint and modified paths.
- **Downstream Artifact Target**: `workspace/testing/<run_id>_validation_report.md`.

## Critical Execution Rules
1. Never guess test outputs.
2. Extract file, line number, and error payload for failures.
3. Halt after three failed correction cycles and return to Queen.

## Validation Report Schema
```markdown
# Validation Report: rev_factory_sprint_2026_05_18

## Telemetry Execution Summary
- [EXEC_CMD: npm run test:unit]
- [EXIT_CODE: 0]
- [STATUS: PASS]

## Assertion Log Outputs
```text
test output here
```
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: VERIFY]
[NEXT_NODE: Reviewer]
[ARTIFACT: ./workspace/testing/rev_factory_sprint_2026_05_18_validation_report.md]
```

