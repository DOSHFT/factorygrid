# AGENTS: Reviewer Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Git diff analyzers, static checks, CodeRabbit where available.
- **Upstream Artifact Targets**: blueprint and validation report.
- **Downstream Artifact Target**: `workspace/review/<run_id>_review_log.json`.

## Critical Execution Rules
1. Reject any modified path outside `allowed_write_paths`.
2. Reject if Tester did not report a passing live test command.
3. Flag third-party dependency, build configuration, container, and credential changes.

## Review Log Schema
```json
{
  "run_id": "rev_factory_sprint_2026_05_18",
  "audit_status": "PASSED",
  "regression_risk_evaluation": "LOW",
  "verified_diffs": ["./src/controllers/userController.ts"],
  "security_findings": []
}
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: REVIEW]
[NEXT_NODE: Documenter]
[ARTIFACT: ./workspace/review/rev_factory_sprint_2026_05_18_review_log.json]
```

