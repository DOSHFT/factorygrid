#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> int:
    print(f"[GATE:ARCHITECTURE][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_architecture.py <architecture_blueprint.json>")

    path = Path(sys.argv[1])
    if not path.exists():
        return fail(f"blueprint missing: {path}")

    data = json.loads(path.read_text())
    run_id = data.get("run_id")
    allowed = data.get("allowed_write_paths")
    if not run_id:
        return fail("run_id missing")
    if not isinstance(allowed, list) or not allowed:
        return fail("allowed_write_paths must be a non-empty list")
    if any(not isinstance(item, str) or item.startswith("/") or ".." in Path(item).parts for item in allowed):
        return fail("allowed_write_paths must be relative paths without '..'")
    print(f"[GATE:ARCHITECTURE][PASS] run_id={run_id} allowed_paths={len(allowed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

