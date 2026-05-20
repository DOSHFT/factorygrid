# Revelation Research Ingestion

Research is a first-class factory stage. Tavily remains useful for quick search. Firecrawl is the preferred deep extraction provider because it can turn web pages into cleaner Markdown or structured data for agents.

## Provider Roles

| Provider | Role | Output |
| --- | --- | --- |
| Tavily | quick search and freshness checks | search result JSON |
| Firecrawl | page scrape, crawl, media parsing, structured extraction | clean markdown, JSON, screenshot metadata |
| Qdrant | retained local research memory | provenance-rich records |

## Source Manifest

Each research task writes `source_manifest.json`:

```json
{
  "run_id": "run-20260517-001",
  "created_at": "2026-05-17T18:00:00Z",
  "sources": [
    {
      "url": "https://example.com",
      "title": "Example",
      "provider": "firecrawl",
      "fetched_at": "2026-05-17T18:00:00Z",
      "content_sha256": "abc123",
      "markdown_path": "research/run-20260517-001/example.md",
      "summary_path": "research/run-20260517-001/example.summary.md"
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

## Firecrawl Integration TODO

- Add `FIRECRAWL_API_KEY` to `.env.example` only after provider choice.
- Add a `research_provider` config with `tavily`, `firecrawl_hosted`, and `firecrawl_self_hosted`.
- Store every extracted page under `workspace/research/<run_id>/`.
- Upsert only summarized/provenance records into Qdrant collection `factory_research_sources`.
- Reject plans that cite research without a URL and fetch timestamp.

