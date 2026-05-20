#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PROTECTED = {
    ".env",
    "docker-compose.yml",
    "litellm_config.yaml",
    "openhands_state/settings.json",
    "bin/start-vllm-factory.sh",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "Cargo.toml",
    "Cargo.lock",
    "pyproject.toml",
    "requirements.txt",
}


def norm(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def fail(message: str) -> int:
    print(f"[GATE:DIFF_SCOPE][FAIL] {message}", file=sys.stderr)
    return 1


def changed_files() -> list[str]:
    out = subprocess.check_output(["git", "status", "--porcelain=v1"], text=True)
    files: list[str] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        raw = line[3:]
        files.append(norm(raw.split(" -> ")[-1]))
    return files


def main() -> int:
    if len(sys.argv) != 2:
        return fail("usage: gate_diff_scope.py <architecture_blueprint.json>")
    blueprint = json.loads(Path(sys.argv[1]).read_text())
    allowed = {norm(item) for item in blueprint.get("allowed_write_paths", [])}
    changed = changed_files()
    outside = [item for item in changed if item not in allowed and not item.startswith("workspace/")]
    protected = [item for item in changed if item in PROTECTED or any(item.endswith("/" + p) for p in PROTECTED)]
    if outside:
        return fail("changed paths outside blueprint: " + ", ".join(outside))
    if protected and blueprint.get("infrastructure_run") is not True:
        return fail("protected paths changed without infrastructure_run=true: " + ", ".join(protected))
    print(f"[GATE:DIFF_SCOPE][PASS] changed={len(changed)} allowed={len(allowed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

