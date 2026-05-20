# SAGE-Inspired Memory Graph Schema

Generated: 2026-05-18T16:50:02.444022Z

FactoryGrid memory remains markdown-first. This schema adds graph edges around the readable truth so agents can retrieve evidence chains instead of isolated pages.

## Node Fields

- `id`: stable identifier.
- `type`: `source`, `run`, `agent`, `capability`, `gate`, `artifact`, `decision`.
- `title`: human-readable label.
- `path`: optional local path or URL.

## Edge Fields

- `from`: source node id.
- `to`: target node id.
- `type`: one of `supports`, `contradicts`, `depends_on`, `supersedes`, `implements`, `validates`, `blocked_by`, `enforced_by`, `requires_research_by`, `requires_validation_by`, `requires_review_by`.
- `confidence`: 0.0 to 1.0.

## Current Files

- `workspace/factory-brain/graph/nodes.jsonl`
- `workspace/factory-brain/graph/edges.jsonl`

## Next Implementation Step

Add a graph reader endpoint that accepts a node id or text query and returns a bounded evidence chain with node paths and edge reasons.
