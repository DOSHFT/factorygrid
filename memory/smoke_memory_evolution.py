"""End-to-end smoke checks for FactoryGrid memory evolution."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from memory_core import UltronMemoryCore
from migrate_factory_brain import migrate


def http_json(url: str, method: str = "GET", body: bytes | None = None) -> dict[str, Any]:
    req = urllib.request.Request(url, method=method, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


async def main() -> dict[str, Any]:
    root = Path(os.getenv("FACTORYGRID_ROOT", "/home/revelation/factorygrid"))
    report: dict[str, Any] = {"root": str(root), "checks": {}}

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        page_dir = temp_root / "workspace" / "factory-brain" / "pages" / "runs"
        page_dir.mkdir(parents=True)
        (page_dir / "fallback-smoke.md").write_text("# Fallback\n\nfallback smoke memory\n", encoding="utf-8")
        saved_password = os.environ.pop("NEO4J_PASSWORD", None)
        try:
            fallback = UltronMemoryCore(factory_root=str(temp_root), neo4j_password=None)
            await fallback.initialize()
            fallback_id = await fallback.add_memory("fallback smoke memory", {"task_id": "memory-smoke-fallback"})
            fallback_hits = await fallback.query("fallback smoke", limit=5)
        finally:
            if saved_password is not None:
                os.environ["NEO4J_PASSWORD"] = saved_password
        report["checks"]["fallback"] = {
            "ok": fallback_id.startswith("fallback-") and bool(fallback_hits),
            "memory_id": fallback_id,
            "hits": len(fallback_hits),
        }

    migration_a = await migrate(root, dry_run=True)
    migration_b = await migrate(root, dry_run=True)
    report["checks"]["migration_idempotency"] = {
        "ok": migration_a["imported"] == migration_b["imported"] and not migration_a["failed"] and not migration_b["failed"],
        "imported": migration_a["imported"],
        "failed": migration_a["failed"],
    }

    neo4j_password = os.getenv("NEO4J_PASSWORD")
    if neo4j_password:
        graph = UltronMemoryCore(factory_root=str(root))
        await graph.initialize()
        memory_id = await graph.add_memory(
            "Neo4j shadow smoke memory from smoke_memory_evolution.py",
            {
                "task_id": "memory-smoke-neo4j",
                "run_id": "memory-evolution-smoke",
                "artifact_path": "memory/smoke/smoke_memory_evolution.md",
                "artifact_type": "smoke-test",
                "reason": "End-to-end smoke test",
            },
            source_task_id="memory-smoke-neo4j",
        )
        hits = await graph.query("smoke_memory_evolution", limit=5)
        repair_id = await graph.repair_memory("smoke repair", [memory_id])
        report["checks"]["neo4j_shadow"] = {
            "ok": graph.neo4j_shadow_ready and memory_id.startswith("neo4j-") and repair_id.startswith("neo4j-") and bool(hits),
            "graphiti_ready": graph.graph_ready,
            "neo4j_shadow_ready": graph.neo4j_shadow_ready,
            "memory_id": memory_id,
            "repair_id": repair_id,
            "hits": len(hits),
        }
    else:
        report["checks"]["neo4j_shadow"] = {"ok": False, "skipped": "NEO4J_PASSWORD not set"}

    qdrant_url = os.getenv("QDRANT_URL", "http://127.0.0.1:6333").rstrip("/")
    try:
        collections = http_json(f"{qdrant_url}/collections")
        count = http_json(f"{qdrant_url}/collections/factory_memory/points/count", "POST", b'{"exact":true}')
        report["checks"]["qdrant"] = {
            "ok": count.get("result", {}).get("count", 0) > 0,
            "collections": collections.get("result", {}).get("collections", []),
            "factory_memory_count": count.get("result", {}).get("count"),
        }
    except (OSError, urllib.error.URLError) as exc:
        report["checks"]["qdrant"] = {"ok": False, "error": str(exc)}

    rufloui_url = os.getenv("RUFLOUI_URL", "http://192.168.178.20:28589").rstrip("/")
    try:
        stats = http_json(f"{rufloui_url}/api/memory/stats")
        report["checks"]["rufloui_memory_api"] = {
            "ok": stats.get("totalEntries", 0) > 0,
            "totalEntries": stats.get("totalEntries"),
        }
    except (OSError, urllib.error.URLError) as exc:
        report["checks"]["rufloui_memory_api"] = {"ok": False, "error": str(exc)}

    report["ok"] = all(check.get("ok") for check in report["checks"].values())
    return report


if __name__ == "__main__":
    result = asyncio.run(main())
    print(json.dumps(result, indent=2, default=str))
    raise SystemExit(0 if result["ok"] else 1)
