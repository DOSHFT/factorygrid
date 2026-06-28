# FactoryGrid Instructions

This is the living support document for operating the Revelation software factory.

## Where To Start Build Requests

Open:

```text
http://localhost:28588/factory
```

Use the Factory Intake form. Fill in:

- Title
- Factory mode: `PLAN`, `DEV`, `UAT`, or `PROD`
- Prompt / vision
- Research-start URLs: 1-3 http(s) links that show relevant examples, docs, products, or source material
- Success criteria
- Cautions

Click `Create Spec Intake`.

## What Happens Next

The UI creates:

- `workspace/spec-kit/intake/<run_id>_request.md`
- `workspace/spec-kit/specs/<run_id>_spec.md`
- `workspace/spec-kit/checklists/<run_id>_approval.md`
- `workspace/factory-brain/pages/runs/<run_id>.md`

Queen reads the intake and draft spec. Researcher gathers current evidence. Architect produces allowed write paths. Coder implements only after the gate allows it. Tester records real command output. Reviewer checks diff scope and risk. Documenter updates Factory Brain.

Research-start URLs are starting points, not proof by themselves. The Researcher must verify freshness, source quality, and contradictions before a claim can enter a plan.

## Prompt Cautions

- Name the repo/workspace explicitly.
- Mention protected files, credentials, network exposure, Docker changes, and host impact.
- Use `PLAN` when the request is still fuzzy.
- Use `DEV` for isolated build work where Docker-scoped execution is acceptable.
- Use `UAT` when host/network/Docker impact might matter.
- Use `PROD` for standard approval gates.

## Service Ownership

- Factory UI: captures intake, writes Spec Kit files, searches Factory Brain.
- RuFlo/Queen: routes the request through agents.
- Researcher: current sources and evidence.
- Architect: write boundaries and contracts.
- OpenHands/Coder: implementation.
- Tester/Reviewer: verification and safety checks.
- Documenter: compiled truth and timeline updates.

## Complex Build Requests

For complex systems such as FIX engines, market-data restreamers, security tooling, or distributed services, start at `http://localhost:28588/factory` and include all external protocol artifacts. For FIX work, attach dictionaries, rules of engagement, endpoint/TLS details, SenderCompID/TargetCompID requirements, heartbeat/sequence-reset policy, and simulator or test-counterparty details. Without those, the factory will run PLAN/RESEARCH/ARCHITECTURE only.

## Technology Choice Escalation

For complex build requests, the Queen must force a technology-choice challenge before implementation. The request should produce `workspace/research/<run_id>/technology_tradeoff_matrix.md`, `github_risk_report.md`, and a connector/performance harness plan. DEV starts only after the technology gate, architecture gate, validation gate, and review gate pass.

## Product Shipping Standard

Before a product moves beyond PLAN/DEV, verify its product root contains `BOM.md`, `docs/Architecture.md`, and a lessons-learned document. For FIX products, the lessons file is `docs/fix_lessons-learned.md`. Product binaries and metrics must stay inside the product root so the product can be moved into its own container later.
