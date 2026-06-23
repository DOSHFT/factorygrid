#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_DOC = ROOT / "docs" / "runbooks" / "FACTORY_EXPORT_COVERAGE.md"
REQUIRED_SCRIPTS = [
    ROOT / "bin" / "factory-uat-copy.sh",
    ROOT / "bin" / "factory-portable-git-sync.sh",
    ROOT / "bin" / "factory-secure-backup.sh",
    ROOT / "bin" / "factory-export-customer.sh",
]
REQUIRED_DOC_PHRASES = [
    "Included Source Classes",
    "Excluded Runtime or Secret Classes",
    "Add-New-File Checklist",
    "Verification Commands",
]
REQUIRED_EXCLUDES = [
    "openhands_state/",
    "qdrant_storage/",
    "node_modules/",
    "workspace/dr/",
    "*.safetensors",
    "*credential*",
    "*secret*",
]
FORBIDDEN_STAGED = re.compile(
    r"(^|/)(\.env$|\.env\.(?!example$)|openhands_state|qdrant_storage|node_modules|logs|.*secret.*|.*credential.*|.*credentials.*|.*\.key$|.*\.pem$)",
    re.I,
)


def fail(message: str) -> int:
    print(f"[GATE:EXPORT_COVERAGE][FAIL] {message}", file=sys.stderr)
    return 1


def main() -> int:
    if not REQUIRED_DOC.exists():
        return fail(f"missing coverage document: {REQUIRED_DOC.relative_to(ROOT)}")
    doc = REQUIRED_DOC.read_text(encoding="utf-8")
    for phrase in REQUIRED_DOC_PHRASES:
        if phrase not in doc:
            return fail(f"coverage document missing section: {phrase}")

    uat_copy = (ROOT / "bin" / "factory-uat-copy.sh").read_text(encoding="utf-8")
    for pattern in REQUIRED_EXCLUDES:
        if pattern not in uat_copy and pattern not in doc:
            return fail(f"missing export exclusion coverage for: {pattern}")

    for script in REQUIRED_SCRIPTS:
        if not script.exists():
            return fail(f"missing export script: {script.relative_to(ROOT)}")
        if not script.stat().st_mode & 0o111:
            return fail(f"export script is not executable: {script.relative_to(ROOT)}")

    # Validate the current index when this gate is run after staging.
    try:
        import subprocess
        staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=ROOT, text=True)
    except Exception:
        staged = ""
    for line in staged.splitlines():
        if line.endswith(".env.example"):
            continue
        if FORBIDDEN_STAGED.search(line):
            return fail(f"secret/runtime path staged: {line}")

    print("[GATE:EXPORT_COVERAGE][PASS] export coverage document, scripts, excludes, and staged paths validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
