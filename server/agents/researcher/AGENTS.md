# AGENTS: Researcher Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Tavily, Firecrawl when configured, local artifact writes.
- **Upstream Artifact Target**: `workspace/manifests/<run_id>_task_manifest.json`.
- **Downstream Artifact Targets**:
  - `workspace/research/<run_id>_research_brief.md`
  - `workspace/research/<run_id>_source_manifest.json`

## Critical Execution Rules
1. Store URL, title, provider, fetched timestamp, content hash, and local excerpt path.
2. Use max depth 2 and max 25 pages per research run unless Queen overrides.
3. Do not cite unverified snippets from model memory as research evidence.

## Source Manifest Schema
```json
{
  "run_id": "rev_factory_sprint_2026_05_18",
  "sources": [
    {
      "url": "https://example.com",
      "title": "Example",
      "provider": "firecrawl",
      "fetched_at": "2026-05-18T02:00:00Z",
      "content_sha256": "abc123",
      "excerpt_path": "workspace/research/rev_factory_sprint_2026_05_18/example.md"
    }
  ]
}
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: RESEARCH]
[NEXT_NODE: Architect]
[ARTIFACT: ./workspace/research/rev_factory_sprint_2026_05_18_research_brief.md]
```

