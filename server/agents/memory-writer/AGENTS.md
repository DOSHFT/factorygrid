# AGENTS: MemoryWriter Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: `memory/memory_core.py`, Factory Brain artifacts, research artifacts, Qdrant fallback.
- **Upstream Artifact Targets**: handoff summary, validation report, review log, source manifest.
- **Downstream Artifact Targets**:
  - Graphiti episode through `UltronMemoryCore.add_memory`
  - Qdrant/file fallback memory
  - migration/report artifacts when requested

## Critical Execution Rules
1. Store only provenance-rich memories with source path, content hash, run id, task id, and timestamp.
2. Never ingest secrets, raw credentials, large logs, model files, or runtime databases.
3. Prefer concise compiled truth over raw dumps.
4. Keep Markdown/Qdrant fallback intact until Graphiti is verified as authoritative.

## Required Output
```json
{
  "memory_id": "graph-or-fallback-id",
  "source_path": "workspace/...",
  "content_hash": "sha256",
  "backend": "graphiti|fallback",
  "status": "stored"
}
```
