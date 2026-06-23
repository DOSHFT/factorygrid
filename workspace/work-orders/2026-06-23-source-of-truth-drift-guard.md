# Source-of-Truth Drift Guard Work Order

Created: 2026-06-23
Priority: P0
Owner: Queen + Planner + Reviewer

## Objective

Prevent drift between:
- GitHub `main`: canonical source of truth.
- `D:\UAT\factorygrid`: normal commit and push workspace.
- Revelation `/home/revelation/factorygrid`: live runtime checkout, reset from GitHub after backup.

## Required Workflow

1. Run a dry-run check:
   ```powershell
   D:\UAT\factorygrid\bin\factory-sync-source-of-truth.ps1
   ```
2. If the dry-run is sane, run apply:
   ```powershell
   D:\UAT\factorygrid\bin\factory-sync-source-of-truth.ps1 -Apply -FixLiveOwnership -Message "sync factory source of truth"
   ```
3. Confirm:
   - UAT `git status --short` is empty.
   - Revelation `git status --short` is empty.
   - RuFloUI `/api/workspace/status` returns `files: []`.
   - `/api/system/health` is healthy.

## Agent Rules

- Always create backups before commit/reset.
- Never commit `.env`, secrets, runtime storage, model artifacts, logs, or generated DB/cache files.
- Do not use live Revelation as the normal authoring source.
- If live Revelation has drift, back it up and reset it to the pushed GitHub commit.
- If protected paths or secret-looking paths are staged, stop and create an RCA note instead of pushing.

## RCA From 2026-06-23

The Workspace UI showed 212 changes because live Revelation was still on an old commit and contained generated/runtime artifacts. UAT/GitHub were cleaner, but the UI reads `/factorygrid` from the live container. The fix is to make GitHub canonical, commit from UAT, reset live from GitHub, and ignore runtime outputs.
