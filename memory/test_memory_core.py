import asyncio
import tempfile
from pathlib import Path

from memory_core import UltronMemoryCore


async def _exercise_fallback() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        page_dir = root / "workspace" / "factory-brain" / "pages" / "runs"
        page_dir.mkdir(parents=True)
        (page_dir / "demo.md").write_text(
            "# Demo\n\n## Compiled Truth\nMemory fallback works.\n\n---\n",
            encoding="utf-8",
        )

        core = UltronMemoryCore(factory_root=str(root))
        await core.initialize()
        memory_id = await core.add_memory("fallback write works", {"task_id": "smoke"})
        hits = await core.query("fallback", limit=5)
        repairs = await core.run_checker_loop({"status": "failed", "result": "contradiction smoke"})

        assert memory_id.startswith("fallback-")
        assert hits
        assert repairs and repairs[0].startswith("fallback-")
        assert (root / "memory" / "fallback" / "memory.jsonl").exists()


def test_fallback_add_query_and_repair() -> None:
    asyncio.run(_exercise_fallback())
