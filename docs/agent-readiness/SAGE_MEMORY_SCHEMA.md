# SAGE-Inspired Memory Graph Schema

Last verified: 2026-06-06

FactoryGrid memory remains markdown-first. This schema adds graph edges around the readable truth so agents can retrieve evidence chains instead of isolated pages.

Neo4j is currently a shadow graph, not authoritative production memory, because the live container is running but unhealthy. Factory Brain plus Qdrant is the current production memory path.

## Node Fields

- `id`: stable identifier.
- `type`: `source`, `run`, `agent`, `capability`, `gate`, `artifact`, `decision`, `service`, `runtime_plane`.
- `title`: human-readable label.
- `path`: optional local path or URL.
- `runtime_plane`: optional `windows`, `revelation`, `decima`, or `docker`.
- `last_verified`: ISO timestamp.
- `status`: `active`, `shadow`, `deprecated`, `blocked`, or `superseded`.

## Edge Fields

- `from`: source node id.
- `to`: target node id.
- `type`: one of `supports`, `contradicts`, `depends_on`, `supersedes`, `implements`, `validates`, `blocked_by`, `enforced_by`, `requires_research_by`, `requires_validation_by`, `requires_review_by`, `runs_on`, `exposes`, `routes_to`.
- `confidence`: 0.0 to 1.0.
- `evidence_path`: local artifact path or source URL.
- `created_at`: ISO timestamp.

## Current Production Files

- `workspace/factory-brain/pages/**`
- Qdrant collections: `factory_context_index`, `factory_research_sources`, `factory_run_artifacts`

## Shadow Graph Files

When graph memory is enabled, use:

- `workspace/factory-brain/graph/nodes.jsonl`
- `workspace/factory-brain/graph/edges.jsonl`

## Required Runtime Nodes

At minimum, the graph should model:

- Windows host `BlackBeast`
- WSL `Revelation`
- WSL `decima-intelligence-it`
- vLLM model server
- LiteLLM gateway
- RuFlo MCP
- RuFloUI
- Qdrant
- Neo4j shadow graph
- Hermes dashboard
- Windows Hermes Desktop

## Next Implementation Step

Add a graph reader endpoint that accepts a node id or text query and returns a bounded evidence chain with node paths, edge reasons, and stale/superseded warnings.
