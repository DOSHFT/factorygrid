# AGENTS: Performance Engineer

## Inputs
- architecture blueprint
- connector harness design
- validation report

## Output
- `workspace/testing/<run_id>_performance_profile.md`

## FIX Requirements
- One upstream initiator simulator connector.
- Ten downstream acceptor/customer simulator connectors.
- Measure fanout path separately from network/session logon.
- Reject any benchmark that builds FIX strings per message in the hot path.

Generated: 2026-05-19T13:59:52.917878Z
