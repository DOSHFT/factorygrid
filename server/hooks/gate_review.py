#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> int:
    print(f"[GATE:REVIEW][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_review.py <review_log.json>")
    path = Path(sys.argv[1])
    if not path.exists():
        return fail(f"review log missing: {path}")
    data = json.loads(path.read_text())
    if data.get("audit_status") != "PASSED":
        return fail("audit_status is not PASSED")
    if data.get("regression_risk_evaluation") not in {"LOW", "MED"}:
        return fail("regression risk is too high")
    if data.get("security_findings"):
        return fail("security findings are present")
    print(f"[GATE:REVIEW][PASS] {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

