# FactoryGrid Guidelines

## Operating Principles

- Start from written intent, not ad hoc commands.
- Use `/factory` for build requests so Spec Kit and Factory Brain artifacts exist from the beginning.
- Always create a DR snapshot before autonomous writes.
- Keep deterministic work in scripts/jobs; use agents for judgment.
- Treat vector search as recall, not truth. Truth lives in compiled brain pages with timelines.
- Keep DEV fast, but keep Docker boundaries visible.
- Gate protected infrastructure changes in UAT and PROD.

## Prompt Quality Bar

A usable request names the target workspace, constraints, success criteria, and caution areas. If a prompt cannot be tested, it should stay in PLAN mode.

## Skillify Rule

When the factory repeats a fix, investigation, prompt pattern, or failure recovery twice, convert it into a tested skill or deterministic script and add it to the relevant resolver/agent docs.

## Principal-Level Build Gate

For complex multilayer stacks, agents may plan and research immediately, but autonomous DEV requires a complete artifact gate: target repo, current dependency research, protocol dictionaries, credentials handling, simulator/test strategy, allowed write paths, and measurable acceptance criteria. If these are missing, the correct agent behavior is to create the work packet and block DEV.

## Product Boundary Standard

Every shipped product must live in its own product root. Product-specific binaries, dictionaries, configs, docs, runtime metrics, and scripts belong inside that product root, not in factory-global `bin/` or root-level docs. Every product root must include:

- `BOM.md`
- `docs/Architecture.md`
- `<domain>_lessons-learned.md`

Run `server/hooks/gate_product_docs.py <product_root>` before validating or shipping a product artifact.
