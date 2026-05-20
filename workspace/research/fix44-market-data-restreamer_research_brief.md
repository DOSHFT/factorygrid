# Research Brief: FIX 4.4 Market Data Restreamer

Run ID: `fix44-market-data-restreamer`
Generated: 2026-05-18T16:48:57.646529Z

## Current Findings

- SAGE supports upgrading FactoryGrid memory from static recall toward self-evolving graph memory. Its practical impact here is stronger evidence-chain retrieval and feedback-driven memory repair.
- cTrader FIX supports FIX 4.4 and documents market data request, snapshot/full refresh, and market data request reject behavior. Downstream acceptor compatibility must be checked against the actual customer-side dictionary/rules.
- Artio is the right Java FIX engine candidate for a low-latency JVM implementation.
- Aeron/Agrona remain relevant for low-latency transport, direct buffers, and efficient hot-path structures.
- The attached docs are useful but too generic: they mention UDP conversion and Windows setup, while the requested target is PrimeXM upstream FIX market data to cTrader-compatible downstream FIX acceptors.

## Blocking Unknowns

- PrimeXM `dictionary.xml` is not in the workspace.
- PrimeXM connection/session details are not available.
- cTrader downstream acceptor dictionary/rules are not attached.
- Target repository path is not selected.
- Performance acceptance targets need concrete thresholds before implementation.

## Recommendation

Run the factory through PLAN, RESEARCH, and ARCHITECTURE now. Hold DEV until protocol artifacts and target repo are present.
