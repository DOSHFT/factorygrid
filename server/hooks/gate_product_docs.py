#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

REQUIRED = ["BOM.md", "docs/Architecture.md", "docs/fix_lessons-learned.md"]


def fail(message: str) -> int:
    print(f"[GATE:PRODUCT_DOCS][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_product_docs.py <product_root>")
    root = Path(sys.argv[1])
    if not root.exists() or not root.is_dir():
        return fail(f"product root missing: {root}")
    missing = [rel for rel in REQUIRED if not (root / rel).is_file()]
    if missing:
        return fail(f"missing product standard files: {', '.join(missing)}")
    print(f"[GATE:PRODUCT_DOCS][PASS] product={root} files={len(REQUIRED)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
