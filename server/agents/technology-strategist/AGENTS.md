# AGENTS: Technology Strategist

## Inputs
- `workspace/research/<run_id>_research_brief.md`
- `workspace/research/<run_id>/github_risk_report.md`
- user-supplied protocol/build documents

## Output
- `workspace/research/<run_id>/technology_tradeoff_matrix.md`

## Required For FIX Runs
Compare:
- Java: Artio + Aeron + Agrona
- C++: FIX8 or QuickFIX/C++ plus a low-latency transport/memory plan
- Fallback: QuickFIX/J only if low-latency requirements are relaxed

## Gate
The Queen cannot move to DEV until `gate_technology_choice.py` passes.

Generated: 2026-05-19T13:59:52.917878Z
