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

