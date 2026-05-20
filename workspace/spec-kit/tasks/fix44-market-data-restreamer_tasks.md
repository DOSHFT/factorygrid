# Tasks: FIX 4.4 Market Data Restreamer

Run ID: `fix44-market-data-restreamer`

## Gate 0 - Missing Inputs

- [ ] Place PrimeXM `dictionary.xml` under the target repo test resources.
- [ ] Add PrimeXM rules of engagement and endpoint details to a gitignored config sample.
- [ ] Add cTrader FIX dictionary/rules for downstream acceptor sessions.
- [ ] Select target repository path.
- [ ] Confirm Java build tool: Maven or Gradle.

## Researcher

- [ ] Verify current Artio dependency coordinates and Java compatibility.
- [ ] Verify current Aeron and Agrona versions.
- [ ] Capture cTrader FIX 4.4 market data request/snapshot/reject requirements.
- [ ] Capture PrimeXM market-data requirements from supplied dictionary/rules.
- [ ] Produce `workspace/research/fix44-market-data-restreamer_research_brief.md`.

## Architect

- [ ] Define module layout: upstream initiator, downstream acceptor, subscription registry, book store, fanout engine, config, benchmark, simulator tests.
- [ ] Define allowed write paths in the target repo only.
- [ ] Define protected paths and credentials handling.
- [ ] Produce `workspace/architecture/fix44-market-data-restreamer_architecture_blueprint.json`.

## Coder

- [ ] Create build skeleton with pinned Artio/Aeron/Agrona dependencies.
- [ ] Add typed config loader with redacted logging.
- [ ] Add dictionary loading and validation tests.
- [ ] Implement upstream initiator session lifecycle.
- [ ] Implement downstream acceptor lifecycle and customer auth.
- [ ] Implement subscription registry.
- [ ] Implement in-memory market-data book.
- [ ] Implement fanout path with allocation checks.
- [ ] Reject all trading/order message types.

## Tester

- [ ] Add unit tests for instrument config, subscription matching, reject policy, and book update behavior.
- [ ] Add simulator integration tests for one upstream and ten downstream sessions.
- [ ] Add benchmark for message fanout p50/p95/p99 and allocation rate.
- [ ] Record exact commands and exit codes in validation report.

## Reviewer

- [ ] Verify no trading path exists.
- [ ] Verify no replay/persistence path exists.
- [ ] Verify credentials are not committed.
- [ ] Verify hot-path allocation risk and backpressure behavior.
- [ ] Verify all modified files are in blueprint allowed paths.

## Documenter

- [ ] Write operator runbook.
- [ ] Write protocol assumptions and missing-input log.
- [ ] Update Factory Brain with final evidence and validation results.
