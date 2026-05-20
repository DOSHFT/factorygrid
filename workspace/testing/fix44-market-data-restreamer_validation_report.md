# Validation Report: fix44-market-data-restreamer

## Harness Monitoring Test
[EXEC_CMD: ./FIXReaper/bin/fix44_connector_harness.py --ticks 50 --clients 10]
[EXIT_CODE: 0]
[STATUS: PASS]

```text
[FIX44_HARNESS][PASS] clients=10 instruments=4 ticks=50 delivered=800 expected=800
[FIX44_HARNESS][SESSIONS] logons=11 disconnects=10 active=11
[FIX44_HARNESS][SUBSCRIPTIONS] total=10 users=10
[FIX44_HARNESS][RECEIVE] upstream=200 normalized=50 map={'XAUUSD#': 'XAUUSD'}
[FIX44_HARNESS][THROUGHPUT] delivered_per_sec=786.05
[FIX44_HARNESS][LATENCY_MS] p50=0.1566 p95=0.1981 max=0.3548
```

## Metrics Artifact
[EXEC_CMD: test -s FIXReaper/runtime/metrics/fix44-market-data-restreamer_metrics.json]
[EXIT_CODE: 0]
[STATUS: PASS]

- Metrics JSON: `FIXReaper/runtime/metrics/fix44-market-data-restreamer_metrics.json`
- Credential manifest: `workspace/research/fix44-market-data-restreamer/credential_manifest.json`
- Secret values are redacted.

## Technology Gate
[EXEC_CMD: server/hooks/gate_technology_choice.py workspace/research/fix44-market-data-restreamer/technology_tradeoff_matrix.md]
[EXIT_CODE: 0]
[STATUS: PASS]

```text
[GATE:TECH_CHOICE][PASS] workspace/research/fix44-market-data-restreamer/technology_tradeoff_matrix.md
```
