# Deployment Orchestration Matrix

```text
[User Input Request]
        |
        v
[Queen] -> task_manifest.json
        |
        v
[Researcher] -> research_brief.md + source_manifest.json
        |
        v
[Architect] -> architecture_blueprint.json
        |
        v
[Gate 1] architecture + snapshot + path bounds
        |
        v
[Coder] -> bounded diff
        |
        v
[Gate 2] diff scope + protected path check
        |
        v
[Tester] -> validation_report.md
        |
        v
[Gate 3] empirical test evidence
        |
        v
[Reviewer] -> review_log.json
        |
        v
[Gate 4] review pass + risk threshold
        |
        v
[Documenter] -> handoff_summary.md + memory prep
```

## Live RuFloUI Swarm Template

Verified on 2026-05-27 through RuFloUI API task `task-1779871888034-2ca023`.

The live swarm initialization path uses upstream-compatible RuFlo concepts:

- `swarm init`
- topology: `hierarchical`
- strategy: `specialized`
- max agents: `7`
- coordinator name: `Queen`

Default spawned roles are constrained to agent types accepted by the installed `@claude-flow/cli`:

| Name | CLI type | Responsibility |
| --- | --- | --- |
| Queen | `coordinator` | Gate user intent, preserve scope, delegate specialist validation |
| Architect | `architect` | Check spec boundaries and protected paths |
| Researcher | `researcher` | Confirm evidence and prior context requirements |
| Coder | `coder` | Available for DEV execution after approval gates |
| Tester | `tester` | Validate artifacts and command output |
| Reviewer | `reviewer` | Review risk, scope, and regression exposure |
| Analyst | `analyst` | Record validation/memory result when `documenter` is unavailable |

Do not hard-code unsupported upstream-only agent types into the live spawn path. On 2026-05-27, `documenter` was listed in newer upstream Hive Mind docs but rejected by the installed local CLI. Add it only after `agent spawn -t documenter` succeeds in the deployed runtime.

## Activation Paths

Agent contracts live in:

```text
/home/revelation/factorygrid/server/agents/<agent>/
```

Hook gates live in:

```text
/home/revelation/factorygrid/server/hooks/
```

RuFlo references these contracts through:

```text
/home/revelation/factorygrid/ruflo_project/ruflo.config.js
```
