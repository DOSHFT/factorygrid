# Spec: FIX 4.4 Market Data Restreamer

Run ID: `fix44-market-data-restreamer`
Created: 2026-05-18T16:48:57.646529Z
Mode: PLAN until missing counterparty artifacts exist.

## Goal

Build a low-latency in-memory market-data restreamer. It connects as a single FIX 4.4 initiator to PrimeXM, subscribes to EURUSD, GBPUSD, US30, XAUUSD, and configurable future instruments, then fans out market-data snapshots/incremental updates to up to 10 downstream FIX 4.4 acceptor sessions using the cTrader market-data protocol shape.

## Non-Goals

- No trading messages.
- No order entry, cancel, replace, position, execution, or allocation flow.
- No message replay action.
- No durable market-data persistence.
- No customer self-service admin UI in v1.

## Required Stack

- Java 17 or current Artio-compatible LTS Java.
- Artio FIX engine.
- Aeron for low-latency intra-process messaging where useful.
- Agrona direct buffers, idle strategies, and low-allocation collections.
- Maven or Gradle with pinned dependency versions.

## Required Protocol Inputs

- PrimeXM `dictionary.xml`.
- PrimeXM FIX 4.4 market data rules of engagement.
- PrimeXM endpoint/TLS/session credentials in `cons_configs/FIXConfigCS.cfg` and `cons_configs/FIXConfigMD.cfg`; current files exist but are empty, so DEV remains blocked.
- cTrader FIX 4.4 dictionary/rules for customer acceptors.
- Instrument mapping table for EURUSD, GBPUSD, US30, XAUUSD and future instruments.

## Functional Requirements

- Start one upstream FIX initiator session to PrimeXM.
- Send market data requests for all configured instruments after logon.
- Accept up to 10 downstream customer FIX sessions.
- Authenticate downstream logons from local config.
- Allow each downstream session to subscribe to one instrument, many instruments, or all instruments.
- Forward only market-data messages relevant to each downstream subscription.
- Reject trading/order messages with BusinessMessageReject or session-level reject according to downstream dictionary.
- Maintain in-memory latest-book state per instrument.
- Support graceful upstream reconnect and downstream session cleanup.

## Performance Requirements

- Allocation-minimized hot path.
- No per-message String construction in fanout path.
- DirectBuffer/MutableAsciiBuffer-based decode/encode where Artio permits.
- p99 internal fanout latency target defined by benchmark before DEV starts.
- Backpressure behavior documented and tested.
- GC and allocation profile captured under load.

## Safety Requirements

- No public network exposure by default.
- Credentials only in `.env` or external secret file excluded from git.
- All generated logs must redact credentials.
- Protected config changes require UAT/PROD gate unless isolated in a new target repo.
