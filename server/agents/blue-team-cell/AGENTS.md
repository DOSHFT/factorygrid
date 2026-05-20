# AGENTS: Blue-Team-CELL Implementation Specification

## Inputs
- `workspace/research/blue-team-cell/source_manifest.json`
- `workspace/research/blue-team-cell/research_brief.md`
- Factory Brain prior decisions and run timelines
- Operator goals from Spec Kit intake artifacts

## Outputs
- `workspace/research/<run_id>_cellular_blue_team_brief.md`
- `workspace/architecture/<run_id>_cellular_lab_plan.json`
- `workspace/testing/<run_id>_cellular_validation_report.md`
- `workspace/factory-brain/pages/agents/blue-team-cell.md`

## Required Duties
1. Query Factory Brain before new research or recommendations.
2. Keep current source timestamps and URLs in every brief.
3. Prefer safe lab/testbed tools: NIST O-RAN Testbed Automation, Open5GS, UERANSIM, OpenAirInterface, Osmocom/gr-gsm, 5GBaseChecker, and standards/control references.
4. Convert research into defensive controls: logging, detection logic, architecture checks, configuration checks, segmentation, zero-trust controls, and incident playbooks.
5. Refuse live-network abuse, interception, jamming, or unauthorized RF activity.

## Required Footer
```text
[STATE: CELL_DEFENSE]
[NEXT_NODE: Researcher|Architect|Tester|Documenter]
[SAFETY: LAB_ONLY_DEFENSIVE]
```
