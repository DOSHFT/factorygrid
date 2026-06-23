#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def github(path: str) -> dict:
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "FactoryGrid-GitHub-Risk-Scout",
            **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {}),
        },
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode("utf-8"))


def search_issues(repo: str, terms: list[str], limit: int) -> list[dict]:
    results: list[dict] = []
    for term in terms:
        query = urllib.parse.quote(f"repo:{repo} {term} in:title,body")
        data = github(f"/search/issues?q={query}&per_page={limit}")
        for item in data.get("items", [])[:limit]:
            results.append({
                "repo": repo,
                "term": term,
                "title": item.get("title"),
                "state": item.get("state"),
                "url": item.get("html_url"),
                "created_at": item.get("created_at"),
                "updated_at": item.get("updated_at"),
            })
        time.sleep(0.2)
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--root", default="/home/revelation/factorygrid")
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--repo", action="append", default=[], help="GitHub repo to scan, e.g. owner/name. Repeatable.")
    parser.add_argument("--term", action="append", default=[], help="Issue search term. Repeatable.")
    args = parser.parse_args()

    root = Path(args.root)
    out_dir = root / "workspace" / "research" / args.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    repos = args.repo
    terms = args.term or ["bug", "performance", "security", "compatibility", "regression"]
    if not repos:
        raise SystemExit("at least one --repo owner/name is required")
    all_items: list[dict] = []
    errors: list[str] = []
    for repo in repos:
        try:
            all_items.extend(search_issues(repo, terms, args.limit))
        except Exception as exc:
            errors.append(f"{repo}: {exc}")

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    raw = {"generated_at": now, "repos": repos, "terms": terms, "items": all_items, "errors": errors}
    (out_dir / "github_risk_report.json").write_text(json.dumps(raw, indent=2), encoding="utf-8")

    lines = [f"# GitHub Risk Report: {args.run_id}", "", f"Generated: {now}", ""]
    if errors:
        lines += ["## Fetch Errors", *[f"- {e}" for e in errors], ""]
    lines += ["## Risks And Mitigation Tests"]
    for item in all_items[:80]:
        lines.append(f"- [UPSTREAM_RISK: {item['repo']}] `{item['term']}` {item['title']} ({item['state']})")
        lines.append(f"  [SOURCE_URL: {item['url']}]")
        lines.append(f"  [MITIGATION_TEST: Add simulator or unit coverage for this failure mode before DEV gate.]")
    if not all_items:
        lines.append("- [UPSTREAM_RISK: none] No issue data fetched; rerun with network/GITHUB_TOKEN.")
        lines.append("  [MITIGATION_TEST: Do not pass technology gate without upstream risk evidence.]")
    (out_dir / "github_risk_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "items": len(all_items), "errors": errors, "report": str(out_dir / "github_risk_report.md")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
