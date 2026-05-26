"""Hybrid temporal memory core for FactoryGrid.

Graphiti/Neo4j is optional during rollout. If it is unavailable, callers still
get deterministic file/Qdrant fallback behavior instead of failed task runs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class MemoryResult:
    content: str
    source: str
    score: float = 0.0
    metadata: dict[str, Any] | None = None


class UltronMemoryCore:
    """Async hybrid memory access with Graphiti primary and safe fallbacks."""

    def __init__(
        self,
        factory_root: str | None = None,
        neo4j_uri: str | None = None,
        neo4j_user: str | None = None,
        neo4j_password: str | None = None,
        qdrant_url: str | None = None,
    ) -> None:
        self.factory_root = Path(factory_root or os.getenv("FACTORYGRID_ROOT", "/home/revelation/factorygrid"))
        self.neo4j_uri = neo4j_uri or os.getenv("NEO4J_URI", "bolt://neo4j:7687")
        self.neo4j_user = neo4j_user or os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = neo4j_password or os.getenv("NEO4J_PASSWORD")
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://qdrant:6333")
        self.graphiti: Any | None = None
        self.qdrant: Any | None = None
        self.graph_ready = False
        self.qdrant_ready = False

    async def initialize(self) -> None:
        """Initialize optional backends. Failure keeps fallback mode alive."""
        await asyncio.gather(self._init_graphiti(), self._init_qdrant())

    async def _init_graphiti(self) -> None:
        if not self.neo4j_password:
            logger.warning("NEO4J_PASSWORD is not set; Graphiti disabled")
            return
        try:
            from graphiti_core import Graphiti  # type: ignore
            from graphiti_core.driver.neo4j_driver import Neo4jDriver  # type: ignore

            driver = Neo4jDriver(uri=self.neo4j_uri, user=self.neo4j_user, password=self.neo4j_password)
            self.graphiti = Graphiti(graph_driver=driver)
            build = getattr(self.graphiti, "build_indices_and_constraints", None)
            if build:
                maybe = build()
                if hasattr(maybe, "__await__"):
                    await maybe
            self.graph_ready = True
            logger.info("Graphiti memory ready at %s", self.neo4j_uri)
        except Exception as exc:  # pragma: no cover - depends on optional service
            self.graphiti = None
            self.graph_ready = False
            logger.warning("Graphiti unavailable; using fallback memory: %s", exc)

    async def _init_qdrant(self) -> None:
        try:
            from qdrant_client import QdrantClient  # type: ignore

            self.qdrant = QdrantClient(url=self.qdrant_url)
            self.qdrant.get_collections()
            self.qdrant_ready = True
        except Exception as exc:  # pragma: no cover - depends on optional service
            self.qdrant = None
            self.qdrant_ready = False
            logger.warning("Qdrant client unavailable; using file fallback: %s", exc)

    async def add_memory(self, content: str, metadata: dict[str, Any], source_task_id: str | None = None) -> str:
        """Write a memory episode with provenance. Falls back to Markdown JSONL."""
        now = datetime.now(timezone.utc).isoformat()
        enriched = {
            **metadata,
            "source_task_id": source_task_id,
            "observed_at": metadata.get("observed_at", now),
            "memory_system": "factorygrid-hybrid",
        }
        if self.graph_ready and self.graphiti:
            try:
                episode = await self.graphiti.add_episode(
                    name=enriched.get("task_id") or source_task_id or f"episode_{now}",
                    episode_body=content,
                    metadata=enriched,
                )
                episode_id = getattr(episode, "uuid", None) or getattr(episode, "id", None) or f"episode_{now}"
                await self._sync_to_qdrant(content, enriched | {"graph_episode_id": episode_id})
                return str(episode_id)
            except Exception as exc:
                logger.error("Graphiti add_memory failed; falling back: %s", exc)
        return self._append_fallback_memory(content, enriched)

    async def query(self, query_text: str, limit: int = 15, temporal_filter: dict[str, Any] | None = None) -> list[MemoryResult]:
        """Hybrid retrieval: Graphiti first, then Qdrant/file fallback."""
        results: list[MemoryResult] = []
        if self.graph_ready and self.graphiti:
            try:
                graph_results = await self.graphiti.search(query=query_text, limit=limit)
                for item in graph_results or []:
                    results.append(MemoryResult(content=str(item), source="graphiti", score=1.0, metadata={"raw": item}))
            except Exception as exc:
                logger.warning("Graphiti query failed; continuing with fallback: %s", exc)
        if len(results) < limit:
            results.extend(await self._query_fallback(query_text, limit - len(results), temporal_filter))
        return results[:limit]

    async def repair_memory(self, issue: str, related_memories: list[str]) -> str:
        """Record a repair request. Graph edges are added in the next integration step."""
        payload = {
            "issue": issue,
            "related_memories": related_memories,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "relation_hint": "invalidated_by",
        }
        return self._append_fallback_memory(json.dumps(payload, indent=2), {"type": "memory-repair"})

    async def run_checker_loop(self, task_result: dict[str, Any]) -> list[str]:
        """SAGE-style validation placeholder that creates repair tasks on failure."""
        failures: list[str] = []
        status = str(task_result.get("status", "")).lower()
        if status in {"failed", "error", "blocked"}:
            repair_id = await self.repair_memory(
                issue=str(task_result.get("result") or task_result.get("error") or "task failed"),
                related_memories=[str(x) for x in task_result.get("related_memories", [])],
            )
            failures.append(repair_id)
        return failures

    async def _sync_to_qdrant(self, content: str, metadata: dict[str, Any]) -> None:
        if not self.qdrant_ready or not self.qdrant:
            return
        logger.info("Qdrant sync placeholder for graph episode: %s", metadata.get("graph_episode_id"))

    async def _query_fallback(
        self,
        query_text: str,
        limit: int,
        temporal_filter: dict[str, Any] | None = None,
    ) -> list[MemoryResult]:
        del temporal_filter
        lower = query_text.lower()
        roots = [
            self.factory_root / "workspace" / "factory-brain" / "pages",
            self.factory_root / "workspace" / "research",
            self.factory_root / "workspace" / "factory-brain" / "graph",
            self.factory_root / "memory" / "fallback",
        ]
        hits: list[MemoryResult] = []
        for root in roots:
            if not root.exists():
                continue
            for path in sorted(root.rglob("*")):
                if not path.is_file() or path.suffix.lower() not in {".md", ".json", ".jsonl"}:
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                haystack = f"{path}\n{text}".lower()
                if lower and lower not in haystack:
                    continue
                hits.append(MemoryResult(content=text[:1200], source=str(path), score=0.25, metadata={"path": str(path)}))
                if len(hits) >= limit:
                    return hits
        return hits

    def _append_fallback_memory(self, content: str, metadata: dict[str, Any]) -> str:
        fallback_dir = self.factory_root / "memory" / "fallback"
        fallback_dir.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc).isoformat()
        digest = str(abs(hash((content, now))))
        record_id = f"fallback-{digest[:16]}"
        record = {
            "id": record_id,
            "content": content,
            "metadata": metadata,
            "created_at": now,
        }
        with (fallback_dir / "memory.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record_id
