# FIXReaper Bill Of Materials

Generated: 2026-05-19T18:54:27.171439Z

## Product Boundary

Root: `/home/revelation/factorygrid/FIXReaper`

## Product Files

| Path | Purpose |
| --- | --- |
| `bin/fix44_connector_harness.py` | Product-local simulator/measurement harness for FIX 4.4 initiator/acceptor behavior. |
| `protocols/fix44/ctraderFIX44.xml` | cTrader-compatible FIX 4.4 dictionary used by acceptor-side harness validation. |
| `runtime/metrics/` | Product-local runtime metrics output directory. |
| `docs/Architecture.md` | Product architecture. |
| `docs/fix_lessons-learned.md` | FIX-specific lessons, risks, and corrections. |

## External Inputs

| Source | Status | Notes |
| --- | --- | --- |
| `/mnt/d/Dev/Projects/_revelation-stack/cons_configs/FIXConfigCS.cfg` | Present, redacted in factory artifacts | Consumer/session working defaults. |
| `/mnt/d/Dev/Projects/_revelation-stack/cons_configs/FIXConfigMD.cfg` | Present, redacted in factory artifacts | Market-data/session working defaults. |
| PrimeXM production rules/endpoints | Pending final production confirmation | Do not commit secrets. |

## Runtime Dependencies

| Dependency | Current Use |
| --- | --- |
| Python 3.12 stdlib | Current harness only. |
| Artio | Target production FIX engine. |
| Aeron | Target low-latency transport/IPC support where useful. |
| Agrona | Target direct-buffer/low-allocation utility layer. |
| cTrader FIX44 dictionary | Acceptor-side dictionary baseline. |

## Shipping Rule

FIXReaper must be movable as a product directory. Product-specific binaries, configs, dictionaries, docs, metrics, and runtime scripts belong under `FIXReaper/`, not factory-global `bin/` or root docs.
