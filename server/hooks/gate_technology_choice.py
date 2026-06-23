#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

REQUIRED = [
    "[TECH_OPTION:",
    "[DECISION_DRIVER:",
    "[REVERSAL_TRIGGER:",
    "github_risk_report.md",
    "connector harness",
]


def fail(message: str) -> int:
    print(f"[GATE:TECH_CHOICE][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_technology_choice.py <technology_tradeoff_matrix.md>")
    path = Path(sys.argv[1])
    if not path.exists():
        return fail(f"technology tradeoff matrix missing: {path}")
    text = path.read_text(encoding="utf-8")
    missing = [item for item in REQUIRED if item not in text]
    if missing:
        return fail(f"missing required evidence markers: {', '.join(missing)}")
    print(f"[GATE:TECH_CHOICE][PASS] {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
