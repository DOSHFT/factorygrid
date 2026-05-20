# FIX Lessons Learned

Generated: 2026-05-19T18:54:27.171439Z

## Product Boundary

Product-specific code initially landed in factory-global `bin/`. That is wrong. FIXReaper now owns its own `bin/`, `docs/`, `protocols/`, `config/`, and `runtime/metrics/` directories.

## Dictionary Handling

- Acceptor-side dictionary: `FIXReaper/protocols/fix44/ctraderFIX44.xml`.
- Production implementation must load dictionaries from product-local paths or explicit mounts.
- Dictionary compatibility is a gate, not a late integration task.

## Symbol Normalization

- Upstream/counterparty symbols may carry suffixes such as `XAUUSD#`.
- Downstream acceptor/customer-side routing requires normalized symbols.
- Current normalization proof: `XAUUSD# -> XAUUSD`.

## Harness Lessons

- The first simulator version published before downstream clients subscribed. That caused missed messages and hanging clients.
- The harness now delays upstream publishing and measures delivery expectations.
- The harness is a simulator, not the production Artio hot path. Production must use generated encoders/reusable buffers, not Python string construction.

## Required Production Tests

- One upstream initiator connection.
- Ten downstream acceptor/customer sessions.
- Mixed subscriptions: wildcard plus individual instruments.
- Reject trading/order messages.
- Reconnect and sequence behavior.
- Per-user delivery metrics.
- Allocation/latency benchmark in the Artio implementation.

## MarketDepth Guardrail
FIXReaper currently supports top-of-book market data only. Incoming MarketDataRequest messages with `264` / `MarketDepth` greater than `1` are rejected with MarketDataRequestReject (`35=Y`) in the harness and must be rejected the same way in production unless full-book support is explicitly implemented and performance-tested. Operators must confirm upstream PrimeXM/cTrader rules will not require unsupported MarketDepth enums before UAT.
