# FactoryGrid Network Exposure

Last verified: 2026-06-23

## Policy

FactoryGrid is local-first. Services must bind to `127.0.0.1` unless they are explicitly approved as operator-facing LAN surfaces.

Approved LAN surfaces:

- RuFloUI frontend: `28589`
- LiteLLM published gateway for Decima Hermes and operator checks: `4001`

Loopback-only by default:

- RuFloUI API: `28580`
- RuFlo MCP: `3011`
- OpenHands: `3001`
- Qdrant: `6333` and `6334`
- Neo4j: `7474` and `7687`
- vLLM diagnostics: `18000`

## Controls

- Compose defaults bind non-public services to `127.0.0.1`.
- `bin/factory-check-network-exposure.sh` fails startup if a non-allowlisted port is published on `0.0.0.0`.
- `FACTORYGRID_ALLOWED_PUBLIC_PORTS` controls the verifier allowlist and defaults to `28589 4001`.
- `bin/factory-expose-lan.ps1` creates Windows portproxy rules only for the requested ports and defaults to `28589,4001`.

## Local Overrides

Set these only in local `.env` when the operator intentionally needs LAN exposure:

```env
RUFLOUI_HOST_BIND=0.0.0.0
LITELLM_PUBLISHED_BIND=0.0.0.0
FACTORYGRID_ALLOWED_PUBLIC_PORTS=28589 4001
```

Keep these loopback unless there is a documented temporary reason:

```env
RUFLOUI_API_HOST_BIND=127.0.0.1
RUFLO_MCP_HOST_BIND=127.0.0.1
```

## Verification

```bash
cd /home/revelation/factorygrid
bin/factory-check-network-exposure.sh
docker compose ps
ss -ltnp | grep -E ':(28589|4001|28580|3011|3001|6333|6334|7474|7687|18000)'
```
