# Memory Evolution Smoke Report

Date: 2026-05-26

## Summary

Status: PASS

FactoryGrid memory evolution is implemented in shadow mode. Factory Brain and Qdrant remain production fallback. Neo4j temporal graph storage is running and smoke-tested. Graphiti is configured for activation when local OpenAI-compatible LLM and embedding endpoints are supplied.

## Checks

- RuFloUI build: PASS with Dockerized Node 20 and `npm ci --legacy-peer-deps`.
- Fallback memory add/query: PASS.
- Neo4j shadow write/read/repair: PASS.
- Migration dry-run idempotency: PASS, 43 artifacts, 0 failures.
- Actual migration into Neo4j shadow: PASS, 43 artifacts, 0 failures.
- Qdrant collection check: PASS, `factory_memory` has 75 points.
- Live RuFloUI memory API check: PASS, 79 entries.
- Neo4j health: PASS.
- UAT RuFloUI backend memory endpoints: PASS on temporary port `28680`.

## Neo4j Counts

```json
{
  "memories": 49,
  "derived": 49,
  "invalidated": 3
}
```

## Migration Report

Detailed JSON:

```text
docs/memory_evolution/migration_report_2026-05-26.json
```

## Runtime Notes

- `graph_ready` is currently false because Graphiti requires both chat and embedding endpoint configuration.
- `neo4j_shadow_ready` is true and provides the tested temporal graph path.
- Qdrant and Markdown fallback paths remain intact.
- Temporary UAT backend smoke container `factory_rufloui_uat_smoke` was stopped and removed after endpoint checks.

## UAT API Endpoint Smoke

Temporary backend:

```text
http://127.0.0.1:28680
```

Endpoints checked:

- `/api/memory/stats`
- `/api/memory?limit=1`
- `/api/memory/evidence-chain?query=architect&limit=2`
- `/api/memory/contradictions`
- `/api/memory/repairs`
- `/api/memory/timeline?limit=2`

Result: all returned HTTP 200 with JSON payloads.

## Build Command Used

```bash
docker run --rm -v /mnt/d/UAT/factorygrid/rufloui:/work -w /work node:20-slim \
  bash -lc "npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/ && npm run build"
```
