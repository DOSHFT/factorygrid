# GitHub Risk Report: fix44-market-data-restreamer

Generated: 2026-05-19T14:00:30.046293Z

## Fetch Errors
- aeron-io/aeron: HTTP Error 403: rate limit exceeded
- aeron-io/agrona: HTTP Error 403: rate limit exceeded
- fix8/fix8: HTTP Error 403: rate limit exceeded
- quickfix-j/quickfixj: HTTP Error 403: rate limit exceeded
- quickfix/quickfix: HTTP Error 403: rate limit exceeded

## Risks And Mitigation Tests
- [UPSTREAM_RISK: artiofix/artio] `dictionary FIX44` lastFixDictionary in session_id_buffer can be corrupted, causing engine launch failure (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/393]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `acceptor initiator` CatchupReplayer doesn't close subscriptions when requesting an inbound replay (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/568]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `acceptor initiator` Acceptor wrongly updates initiator's sequence when rejecting connection (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/295]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `market data` Use same timestamp as SendingTime in outbound FIX and FixMessage.timestamp (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/pull/550]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `sequence reset` Support unsigned 64-bit integers for sequence numbers  (open)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/480]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `sequence reset` Artio Hangs Until Own Heartbeat After Resend Request (open)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/545]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `reconnect` SessionScheduler doesn't scheduleStart() after end of day (open)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/418]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `reconnect` Session accumulate in pendingInitiatorSessions when logon fails (open)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/515]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `latency` FIXP + SOFH + SBE API support (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/400]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
- [UPSTREAM_RISK: artiofix/artio] `latency` Should we do time validation? (closed)
  [SOURCE_URL: https://github.com/artiofix/artio/issues/3]
  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]
