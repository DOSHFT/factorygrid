#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


def fail(message: str) -> int:
    print(f"[GATE:VALIDATION][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_validation.py <validation_report.md>")
    path = Path(sys.argv[1])
    if not path.exists():
        return fail(f"validation report missing: {path}")
    text = path.read_text(errors="ignore")
    if "[EXEC_CMD:" not in text:
        return fail("missing [EXEC_CMD]")
    if not re.search(r"\[EXIT_CODE:\s*0\]", text):
        return fail("missing zero exit code")
    if "[STATUS: PASS]" not in text:
        return fail("missing pass status")
    print(f"[GATE:VALIDATION][PASS] {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

