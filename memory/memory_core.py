"""Hybrid temporal memory core for FactoryGrid.

Graphiti/Neo4j is optional during rollout. If it is unavailable, callers still
get deterministic file/Qdrant fallback behavior instead of failed task runs.
"""

from __future__ import annotations

import asyncio
import hashlib
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
        self.graphiti_llm_base_url = os.getenv("GRAPHITI_LLM_BASE_URL")
        self.graphiti_llm_model = os.getenv("GRAPHITI_LLM_MODEL")
        self.graphiti_llm_api_key = os.getenv("GRAPHITI_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.graphiti_embedding_base_url = os.getenv("GRAPHITI_EMBEDDING_BASE_URL")
        self.graphiti_embedding_model = os.getenv("GRAPHITI_EMBEDDING_MODEL")
        self.graphiti_embedding_api_key = os.getenv("GRAPHITI_EMBEDDING_API_KEY") or self.graphiti_llm_api_key
        self.graphiti: Any | None = None
        self.neo4j_driver: Any | None = None
        self.qdrant: Any | None = None
        self.graph_ready = False
        self.neo4j_shadow_ready = False
        self.qdrant_ready = False

    async def initialize(self) -> None:
        """Initialize optional backends. Failure keeps fallback mode alive."""
        await asyncio.gather(self._init_graphiti(), self._init_qdrant())

    async def _init_graphiti(self) -> None:
        if not self.neo4j_password:
            logger.warning("NEO4J_PASSWORD is not set; Graphiti disabled")
            return
        graphiti_configured = all([
            self.graphiti_llm_base_url,
            self.graphiti_llm_model,
            self.graphiti_llm_api_key,
            self.graphiti_embedding_base_url,
            self.graphiti_embedding_model,
            self.graphiti_embedding_api_key,
        ])
        if not graphiti_configured:
            logger.info("Graphiti LLM/embedding endpoints not fully configured; using Neo4j shadow memory")
            await self._init_neo4j_shadow()
            return
        try:
            from graphiti_core import Graphiti  # type: ignore
            from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig  # type: ignore
            from graphiti_core.llm_client.config import LLMConfig  # type: ignore
            from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient  # type: ignore

            llm_client = None
            if self.graphiti_llm_base_url and self.graphiti_llm_model and self.graphiti_llm_api_key:
                llm_client = OpenAIGenericClient(LLMConfig(
                    api_key=self.graphiti_llm_api_key,
                    model=self.graphiti_llm_model,
                    small_model=self.graphiti_llm_model,
                    base_url=self.graphiti_llm_base_url,
                    temperature=0,
                ))
            embedder = None
            if self.graphiti_embedding_base_url and self.graphiti_embedding_model and self.graphiti_embedding_api_key:
                embedder = OpenAIEmbedder(OpenAIEmbedderConfig(
                    api_key=self.graphiti_embedding_api_key,
                    base_url=self.graphiti_embedding_base_url,
                    embedding_model=self.graphiti_embedding_model,
                ))

            self.graphiti = Graphiti(
                uri=self.neo4j_uri,
                user=self.neo4j_user,
                password=self.neo4j_password,
                llm_client=llm_client,
                embedder=embedder,
            )
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
        await self._init_neo4j_shadow()

    async def _init_neo4j_shadow(self) -> None:
        if not self.neo4j_password:
            return
        try:
            from neo4j import GraphDatabase  # type: ignore

            self.neo4j_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))
            await asyncio.to_thread(self._verify_neo4j_shadow)
            self.neo4j_shadow_ready = True
            logger.info("Neo4j shadow memory ready at %s", self.neo4j_uri)
        except Exception as exc:  # pragma: no cover - depends on optional service
            self.neo4j_driver = None
            self.neo4j_shadow_ready = False
            logger.warning("Neo4j shadow memory unavailable: %s", exc)

    def _verify_neo4j_shadow(self) -> None:
        if not self.neo4j_driver:
            raise RuntimeError("Neo4j driver not initialized")
        with self.neo4j_driver.session() as session:
            session.run("RETURN 1").consume()
            session.run("CREATE CONSTRAINT factory_memory_id IF NOT EXISTS FOR (m:FactoryMemory) REQUIRE m.id IS UNIQUE").consume()
            session.run("CREATE INDEX factory_memory_text IF NOT EXISTS FOR (m:FactoryMemory) ON (m.search_text)").consume()

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
        if self.neo4j_shadow_ready:
            try:
                episode_id = await asyncio.to_thread(self._neo4j_add_memory, content, enriched)
                await self._sync_to_qdrant(content, enriched | {"graph_episode_id": episode_id, "graph_backend": "neo4j-shadow"})
                return episode_id
            except Exception as exc:
                logger.error("Neo4j shadow add_memory failed; falling back: %s", exc)
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
        if len(results) < limit and self.neo4j_shadow_ready:
            try:
                results.extend(await asyncio.to_thread(self._neo4j_query, query_text, limit - len(results)))
            except Exception as exc:
                logger.warning("Neo4j shadow query failed; continuing with fallback: %s", exc)
        if len(results) < limit:
            results.extend(await self._query_fallback(query_text, limit - len(results), temporal_filter))
        return results[:limit]

    async def repair_memory(self, issue: str, related_memories: list[str]) -> str:
        """Record a repair request and link related memories when graph is available."""
        payload = {
            "issue": issue,
            "related_memories": related_memories,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "relation_hint": "invalidated_by",
        }
        if self.neo4j_shadow_ready:
            try:
                return await asyncio.to_thread(self._neo4j_add_repair, issue, related_memories, payload)
            except Exception as exc:
                logger.warning("Neo4j shadow repair write failed; using file fallback: %s", exc)
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
        graph_episode_id = metadata.get("graph_episode_id")
        if not graph_episode_id:
            return
        try:
            collections = self.qdrant.get_collections()
            names = [c.name for c in getattr(collections, "collections", [])]
            for collection in names:
                points, _ = self.qdrant.scroll(
                    collection_name=collection,
                    scroll_filter=None,
                    limit=100,
                    with_payload=True,
                    with_vectors=False,
                )
                content_hash = self._content_hash(content)
                for point in points:
                    payload = getattr(point, "payload", {}) or {}
                    payload_text = json.dumps(payload, sort_keys=True, default=str)
                    artifact_path = metadata.get("artifact_path")
                    if content_hash in payload_text or (artifact_path and artifact_path in payload_text):
                        self.qdrant.set_payload(
                            collection_name=collection,
                            payload={
                                "graph_episode_id": graph_episode_id,
                                "graph_backend": metadata.get("graph_backend", "graphiti"),
                            },
                            points=[point.id],
                        )
        except Exception as exc:
            logger.warning("Qdrant graph payload sync failed: %s", exc)

    def _neo4j_add_memory(self, content: str, metadata: dict[str, Any]) -> str:
        if not self.neo4j_driver:
            raise RuntimeError("Neo4j driver not initialized")
        now = datetime.now(timezone.utc).isoformat()
        content_hash = self._content_hash(content)
        memory_id = f"neo4j-{content_hash[:24]}"
        payload = {
            "id": memory_id,
            "content": content,
            "content_hash": content_hash,
            "search_text": f"{metadata.get('artifact_path', '')}\n{content}".lower(),
            "source_task_id": metadata.get("source_task_id"),
            "task_id": metadata.get("task_id"),
            "run_id": metadata.get("run_id"),
            "artifact_path": metadata.get("artifact_path"),
            "artifact_type": metadata.get("artifact_type"),
            "observed_at": metadata.get("observed_at", now),
            "valid_from": metadata.get("valid_from", metadata.get("observed_at", now)),
            "valid_until": metadata.get("valid_until"),
            "reason": metadata.get("reason"),
            "metadata_json": json.dumps(metadata, sort_keys=True, default=str),
            "created_at": now,
            "updated_at": now,
        }
        with self.neo4j_driver.session() as session:
            session.run(
                """
                MERGE (m:FactoryMemory {id: $id})
                SET m += $payload
                WITH m
                MERGE (s:FactorySource {path: coalesce($artifact_path, 'unknown')})
                SET s.updated_at = $updated_at
                MERGE (m)-[rel:DERIVED_FROM]->(s)
                SET rel.observed_at = $observed_at,
                    rel.valid_from = $valid_from,
                    rel.valid_until = $valid_until,
                    rel.reason = $reason
                """,
                id=memory_id,
                payload=payload,
                artifact_path=payload["artifact_path"],
                updated_at=now,
                observed_at=payload["observed_at"],
                valid_from=payload["valid_from"],
                valid_until=payload["valid_until"],
                reason=payload["reason"],
            ).consume()
        return memory_id

    def _neo4j_query(self, query_text: str, limit: int) -> list[MemoryResult]:
        if not self.neo4j_driver:
            return []
        lower = query_text.lower()
        with self.neo4j_driver.session() as session:
            rows = session.run(
                """
                MATCH (m:FactoryMemory)
                WHERE $query_text = '' OR m.search_text CONTAINS $query_text
                RETURN m
                ORDER BY m.updated_at DESC
                LIMIT $limit
                """,
                query_text=lower,
                limit=limit,
            )
            results = []
            for row in rows:
                node = dict(row["m"])
                results.append(MemoryResult(
                    content=str(node.get("content", ""))[:1200],
                    source=str(node.get("artifact_path") or node.get("id")),
                    score=0.85,
                    metadata=node | {"backend": "neo4j-shadow"},
                ))
            return results

    def _neo4j_add_repair(self, issue: str, related_memories: list[str], payload: dict[str, Any]) -> str:
        content = json.dumps(payload, indent=2)
        repair_id = self._neo4j_add_memory(content, {
            "artifact_type": "memory-repair",
            "artifact_path": f"memory/repairs/{self._content_hash(content)[:16]}.json",
            "reason": issue,
            "task_id": "MemoryRepairTask",
        })
        if not self.neo4j_driver:
            return repair_id
        now = datetime.now(timezone.utc).isoformat()
        with self.neo4j_driver.session() as session:
            for related in related_memories:
                session.run(
                    """
                    MATCH (r:FactoryMemory {id: $repair_id})
                    MATCH (m:FactoryMemory {id: $related_id})
                    MERGE (m)-[rel:INVALIDATED_BY]->(r)
                    SET rel.observed_at = $observed_at,
                        rel.valid_from = $observed_at,
                        rel.reason = $reason
                    """,
                    repair_id=repair_id,
                    related_id=related,
                    observed_at=now,
                    reason=issue,
                ).consume()
        return repair_id

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

    @staticmethod
    def _content_hash(content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()
