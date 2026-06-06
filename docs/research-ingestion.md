# Revelation Research Ingestion

Last verified: 2026-06-06

Research is a first-class factory stage. The live stack can perform quick freshness checks through Tavily and can persist summarized research into Factory Brain and Qdrant. Firecrawl remains a planned deep-extraction option unless its endpoint/key is explicitly configured.

## Provider Roles

| Provider | Live Status | Role | Output |
| --- | --- | --- | --- |
| Tavily | configured in Revelation `.env` | quick search and freshness checks | search result JSON and cited URLs |
| Firecrawl | not production-confirmed | page scrape/crawl/media parsing | clean markdown or structured extraction when configured |
| Qdrant | healthy production container | retained local research memory | provenance-rich vectors and payloads |
| Factory Brain | active markdown truth | durable operator-readable memory | pages under `workspace/factory-brain/pages` |
| Neo4j / Graphiti | running but unhealthy | shadow graph candidate | temporal graph once health and write/read paths are green |

## Source Manifest

Each research task writes `source_manifest.json`:

```json
{
  "run_id": "run-20260606-001",
  "created_at": "2026-06-06T20:00:00Z",
  "sources": [
    {
      "url": "https://example.com",
      "title": "Example",
      "provider": "tavily",
      "fetched_at": "2026-06-06T20:00:00Z",
      "content_sha256": "abc123",
      "markdown_path": "workspace/research/run-20260606-001/example.md",
      "summary_path": "workspace/research/run-20260606-001/example.summary.md"
    }
  ]
}
```

## Crawl Limits

- Maximum depth: 2 unless explicitly approved.
- Maximum pages: 25 per research run.
- Maximum per-page extracted Markdown: 150 KB before summarization.
- Timeout: 30 seconds per page.
- Deny secrets, private admin pages, and credentialed URLs unless explicitly scoped.
- Preserve robots/legal constraints for external sites.
- Browser/Hermes/claude-code research done in Decima must write artifacts back to the FactoryGrid workspace or cite the Decima-local path explicitly.

## Required Research Behavior

- Every researched claim requires a URL, fetch timestamp, and source manifest entry.
- Every summary stored in memory must point back to a local artifact path.
- Repeated research failures become repair tasks for the Researcher or GitHub-Risk-Scout agent.
- Stale vendor docs, APIs, model releases, pricing, and security claims must be rechecked before implementation.
- Raw page dumps are not allowed in model context; summarize and save artifacts instead.

## Production Memory Targets

| Collection / Location | Purpose |
| --- | --- |
| `factory_context_index` | reusable context snippets and decisions |
| `factory_research_sources` | summarized research with source metadata |
| `factory_run_artifacts` | run-level outputs and validation handoffs |
| `workspace/factory-brain/pages` | human-readable durable memory |

## Firecrawl Integration TODO

- Add `FIRECRAWL_API_KEY` to `.env.example` only after provider choice.
- Add a `research_provider` config with `tavily`, `firecrawl_hosted`, and `firecrawl_self_hosted`.
- Store every extracted page under `workspace/research/<run_id>/`.
- Upsert only summarized/provenance records into Qdrant collection `factory_research_sources`.
- Reject plans that cite research without a URL and fetch timestamp.
