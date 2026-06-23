# FactoryGrid Memory Evolution Runbook

Date: 2026-05-26

## Current Mode

FactoryGrid memory runs in hybrid shadow mode:

- Factory Brain Markdown remains readable source of truth.
- Qdrant remains the production recall fallback.
- Neo4j stores temporal graph shadow records through `memory/memory_core.py`.
- Graphiti is wired but only becomes active when local OpenAI-compatible LLM and embedding endpoints are configured.

Do not make Graphiti authoritative until migration, write/read, evidence-chain, and rollback checks pass.

## Start Neo4j

```bash
cd /home/revelation/factorygrid
cp .env.example .env
# set NEO4J_PASSWORD to a local secret
docker compose up -d neo4j
docker inspect -f '{{.State.Health.Status}}' factory_neo4j
```

Expected:

```text
healthy
```

## Install Memory Python Dependencies

```bash
cd /home/revelation/factorygrid
python -m pip install -r memory/requirements.txt
```

## Smoke Tests

Fallback mode:

```bash
cd /home/revelation/factorygrid
python memory/test_memory_core.py
```

Neo4j shadow write/read/repair:

```bash
cd /home/revelation/factorygrid
export NEO4J_URI=bolt://127.0.0.1:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=<local-secret>
export QDRANT_URL=http://127.0.0.1:6333
export FACTORYGRID_ROOT=/home/revelation/factorygrid
python memory/test_neo4j_shadow.py
```

RuFloUI build from the pinned Node 20 lane:

```bash
cd /home/revelation/factorygrid
bin/rufloui-build.sh
```

Use this instead of PowerShell `npm run build` after a Linux/Docker install. Linux-created `node_modules/.bin` entries do not include Windows `.cmd` shims, and the host may have a different Node major version.

Migration dry-run:

```bash
python memory/migrate_factory_brain.py --root /home/revelation/factorygrid --dry-run
```

Expected current UAT count:

```text
imported: 43
failed: []
```

## Graphiti Activation

Graphiti requires OpenAI-compatible chat and embedding endpoints.

Set:

```bash
GRAPHITI_LLM_BASE_URL=http://litellm:4000/v1
GRAPHITI_LLM_MODEL=qwen-coder-14b
GRAPHITI_LLM_API_KEY=<local-secret>
GRAPHITI_EMBEDDING_BASE_URL=<openai-compatible-embedding-base-url>
GRAPHITI_EMBEDDING_MODEL=<embedding-model>
GRAPHITI_EMBEDDING_API_KEY=<embedding-api-key-or-local-token>
```

If these are missing, `UltronMemoryCore` logs Graphiti unavailable and continues through Neo4j shadow plus Qdrant/file fallback.

## Rollback

To roll back graph memory without affecting production recall:

```bash
cd /home/revelation/factorygrid
docker compose stop neo4j
```

Then set:

```bash
NEO4J_PASSWORD=
GRAPHITI_LLM_BASE_URL=
GRAPHITI_EMBEDDING_BASE_URL=
```

Qdrant and Factory Brain remain intact because they are not removed or made dependent on Neo4j.

To remove the local graph data after export/review:

```bash
docker compose down
docker volume rm factorygrid_neo4j_data factorygrid_neo4j_logs factorygrid_neo4j_import
```

Do not remove graph volumes until any useful shadow memories have been migrated or explicitly discarded.
