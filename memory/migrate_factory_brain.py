"""Import existing Factory Brain and research artifacts into hybrid memory."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path
from typing import Iterable

try:
    from .memory_core import UltronMemoryCore
except ImportError:  # Direct script execution from memory/
    from memory_core import UltronMemoryCore


INCLUDE_SUFFIXES = {".md", ".json", ".jsonl"}


def iter_memory_files(root: Path) -> Iterable[Path]:
    scan_roots = [
        root / "workspace" / "factory-brain" / "pages",
        root / "workspace" / "factory-brain" / "graph",
        root / "workspace" / "research",
    ]
    for scan_root in scan_roots:
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob("*")):
            if path.is_file() and path.suffix.lower() in INCLUDE_SUFFIXES:
                yield path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def migrate(root: Path, dry_run: bool = False) -> dict[str, object]:
    core = UltronMemoryCore(factory_root=str(root))
    await core.initialize()
    report: dict[str, object] = {
        "root": str(root),
        "dry_run": dry_run,
        "graph_ready": core.graph_ready,
        "qdrant_ready": core.qdrant_ready,
        "imported": 0,
        "failed": [],
    }

    for path in iter_memory_files(root):
        rel = path.relative_to(root).as_posix()
        try:
            text = read_text(path)
            metadata = {
                "artifact_path": rel,
                "artifact_type": path.suffix.lower().lstrip(".") or "file",
                "content_hash": content_hash(text),
                "source": "factory-brain-migration",
            }
            if not dry_run:
                await core.add_memory(text, metadata, source_task_id="memory-migration")
            report["imported"] = int(report["imported"]) + 1
        except Exception as exc:
            failed = report["failed"]
            assert isinstance(failed, list)
            failed.append({"path": rel, "error": str(exc)})
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/home/revelation/factorygrid")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", default="")
    args = parser.parse_args()

    report = asyncio.run(migrate(Path(args.root), dry_run=args.dry_run))
    rendered = json.dumps(report, indent=2)
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
