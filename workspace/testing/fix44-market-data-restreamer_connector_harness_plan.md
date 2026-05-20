# Connector Harness Plan: FIX 4.4 Restreamer

Run ID: `fix44-market-data-restreamer`
Generated: 2026-05-19T13:59:52.917878Z

## Purpose

The factory must measure the system before claiming it can restream market data. The harness creates controlled FIX connector surfaces:

- PrimeXM-side simulator acceptor for the upstream initiator.
- Restreamer upstream initiator connector.
- Restreamer downstream acceptor connector.
- Ten customer-side simulator initiators.

## Required Measurements

- Logon time for upstream initiator.
- Logon time for ten downstream initiators.
- MarketDataRequest fanout setup latency.
- Snapshot/full-refresh fanout p50/p95/p99.
- Incremental-refresh fanout p50/p95/p99.
- Allocation rate in hot path.
- Disconnect/reconnect behavior.
- Reject path for order/trading messages.

## Dictionary

Use `FIXReaper/protocols/fix44/ctraderFIX44.xml` for the cTrader-compatible FIX 4.4 acceptor side. Upstream PrimeXM dictionary remains a separate required artifact unless PrimeXM confirms standard FIX44 is sufficient.

## DEV Gate

No implementation can pass DEV readiness until this harness exists in the target repo and produces a validation report.
