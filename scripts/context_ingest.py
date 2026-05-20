#!/usr/bin/env python3
"""Create a provenance-rich local context index without flooding model context."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
    ".ruflo",
    ".swarm",
    "qdrant_storage",
    "__pycache__",
}
SKIP_NAMES = {".env", "secrets.json", ".jwt_secret"}
TEXT_SUFFIXES = {
    ".md",
    ".txt",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".sh",
    ".css",
    ".html",
}


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        rel_parts = path.relative_to(root).parts
        if any(part in SKIP_DIRS for part in rel_parts):
            continue
        if path.name in SKIP_NAMES or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if path.is_file() and path.stat().st_size <= 250_000:
            yield path


def summarize(text: str, max_chars: int = 900) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    joined = " ".join(lines)
    return joined[:max_chars]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Workspace root to index")
    parser.add_argument("--out", default="artifacts/context-index.jsonl", help="JSONL output")
    parser.add_argument("--run-id", default=datetime.now(timezone.utc).strftime("run-%Y%m%d-%H%M%S"))
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out = Path(args.out)
    if not out.is_absolute():
        out = root / out
    out.parent.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).isoformat()
    count = 0
    with out.open("w", encoding="utf-8") as handle:
        for path in iter_files(root):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            rel = path.relative_to(root).as_posix()
            record = {
                "run_id": args.run_id,
                "source_path": rel,
                "symbol": path.stem,
                "summary": summarize(text),
                "exact_excerpt": text[:2000],
                "hash": sha256_text(text),
                "language": path.suffix.lower().lstrip(".") or "text",
                "dependencies": [],
                "last_verified": now,
            }
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1

    print(json.dumps({"root": str(root), "out": str(out), "records": count, "run_id": args.run_id}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

