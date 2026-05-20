# FIXReaper Architecture

Generated: 2026-05-19T18:54:27.171439Z

## Purpose

FIXReaper is the product boundary for the FIX 4.4 market-data restreamer. It will consume one upstream market-data FIX initiator connection and expose downstream FIX 4.4 acceptor sessions for customer subscriptions.

## Current Harness Architecture

```text
PrimeXM simulator acceptor
  -> FIXReaper upstream initiator
  -> normalization and subscription registry
  -> FIXReaper downstream acceptor
  -> 10 customer simulator initiators
```

## Production Target

```text
PrimeXM FIX 4.4 market data endpoint
  -> Artio initiator connector
  -> in-memory normalized book and subscription registry
  -> Artio acceptor connectors for customer sessions
  -> customer FIX 4.4 initiators
```

## Product-Local Components

- `bin/fix44_connector_harness.py`: simulator harness for connector behavior and metrics.
- `protocols/fix44/ctraderFIX44.xml`: cTrader-compatible FIX 4.4 acceptor dictionary.
- `runtime/metrics/`: local metrics output.

## Metrics Required

- Session lifecycle: logons, disconnects, active tracked states.
- User/session management: sender/user alias and per-user delivery counts.
- Subscription state: raw request, normalized instrument, wildcard subscriptions.
- Receive path: upstream message count and normalized message count.
- Normalization map: example `XAUUSD# -> XAUUSD`.
- Delivery and performance: per-user delivery, total delivery, throughput, p50/p95/max latency.

## Non-Goals

- No trading.
- No order messages.
- No message replay action.
- No durable market-data persistence in the hot path.

## Container/Shipping Constraint

Everything needed for product-local execution must live under `FIXReaper/` or be mounted explicitly as external secrets/configs. The factory may orchestrate the product, but the product must not depend on factory-global product binaries.

## MarketDepth Guardrail
FIXReaper currently supports top-of-book market data only. Incoming MarketDataRequest messages with `264` / `MarketDepth` greater than `1` are rejected with MarketDataRequestReject (`35=Y`) in the harness and must be rejected the same way in production unless full-book support is explicitly implemented and performance-tested. Operators must confirm upstream PrimeXM/cTrader rules will not require unsupported MarketDepth enums before UAT.
