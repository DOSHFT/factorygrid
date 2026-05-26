import asyncio
import os

from memory_core import UltronMemoryCore


async def _exercise_neo4j_shadow() -> None:
    password = os.environ["NEO4J_PASSWORD"]
    core = UltronMemoryCore(
        factory_root=os.environ.get("FACTORYGRID_ROOT", "/home/revelation/factorygrid"),
        neo4j_uri=os.environ.get("NEO4J_URI", "bolt://127.0.0.1:7687"),
        neo4j_user=os.environ.get("NEO4J_USER", "neo4j"),
        neo4j_password=password,
        qdrant_url=os.environ.get("QDRANT_URL", "http://127.0.0.1:6333"),
    )
    await core.initialize()
    assert core.neo4j_shadow_ready, "Neo4j shadow backend did not initialize"

    memory_id = await core.add_memory(
        "Neo4j shadow smoke memory: temporal provenance works.",
        {
            "task_id": "neo4j-shadow-smoke",
            "run_id": "memory-evolution-smoke",
            "artifact_path": "memory/smoke/neo4j-shadow.md",
            "artifact_type": "smoke-test",
            "valid_from": "2026-05-26T00:00:00+00:00",
            "reason": "Phase 7 graph write/read smoke test",
        },
        source_task_id="neo4j-shadow-smoke",
    )
    assert memory_id.startswith("neo4j-"), memory_id

    hits = await core.query("temporal provenance", limit=5)
    assert any(hit.metadata and hit.metadata.get("id") == memory_id for hit in hits), hits

    repair_id = await core.repair_memory("smoke invalidation", [memory_id])
    assert repair_id.startswith("neo4j-"), repair_id
    print({"neo4j_shadow_ready": core.neo4j_shadow_ready, "memory_id": memory_id, "repair_id": repair_id, "hits": len(hits)})


def test_neo4j_shadow_write_read_repair() -> None:
    asyncio.run(_exercise_neo4j_shadow())


if __name__ == "__main__":
    test_neo4j_shadow_write_read_repair()
