# FactoryGrid UAT Copy and GitHub Backup

## Scope
The factory repository is the source of truth for orchestration code, RuFlo agent definitions, hooks, product roots, docs, specs, and recovery scripts.

Runtime state and secrets are intentionally not backed up to GitHub:
- `.env` and local secret files
- OpenHands JWT/secrets
- Qdrant runtime storage
- logs and DR snapshots
- `node_modules`, build outputs, caches
- local DBs and large model/data blobs

## Portable UAT Copy
Create a fresh copy under `D:\UAT\factorygrid`:

```bash
cd /home/revelation/factorygrid
bin/factory-uat-copy.sh /mnt/d/UAT/factorygrid
```

The copy includes `RESTORE_UAT.md` with fresh-WSL restore commands.


## One-Command Secure Backup
Refresh the portable copy, commit source changes, push to the local UAT bare repo, and push to GitHub if `origin` exists:

```bash
cd /home/revelation/factorygrid
bin/factory-secure-backup.sh "sync factory changes"
```

Immediate local secured targets:
- Portable copy: `D:\UAT\factorygrid`
- Top-level bare Git repo: `D:\UAT\factorygrid.git`
- Full portable bare Git repo, including nested RuFloUI source: `D:\UAT\factorygrid-portable.git`

Clone into a new WSL box from the bare repo:

```bash
git clone /mnt/d/UAT/factorygrid-portable.git factorygrid
cd factorygrid
cp .env.example .env
npm --prefix ruflo_project install
npm --prefix rufloui install --legacy-peer-deps
docker compose up -d
./bin/factory-doctor.sh
```

## GitHub Private Repo Push
Create a private GitHub repository, then attach it once:

```bash
cd /home/revelation/factorygrid
git remote add origin https://github.com/<owner>/<private-repo>.git
bin/factory-github-push.sh "initial secured factory sync"
```

Ad-hoc push after future changes:

```bash
cd /home/revelation/factorygrid
bin/factory-github-push.sh "sync factory changes"
```

## Nested RuFloUI
`rufloui/` is its own repository. Push it separately when UI source changes:

```bash
cd /home/revelation/factorygrid/rufloui
git add -A
git commit -m "sync rufloui factory integration"
git push origin main
```



## Canonical Source-of-Truth Sync

Use this for normal FactoryGrid sync. GitHub `main` is canonical, `D:\UAT\factorygrid` is the commit/push workspace, and live Revelation `/home/revelation/factorygrid` is reset to the pushed commit after backup.

Dry-run first:

```powershell
D:\UAT\factorygrid\bin\factory-sync-source-of-truth.ps1
```

Apply after the dry-run is reviewed:

```powershell
D:\UAT\factorygrid\bin\factory-sync-source-of-truth.ps1 -Apply -FixLiveOwnership -Message "sync factory source of truth"
```

The script:
- backs up UAT and live Revelation drift;
- commits and pushes only from `D:\UAT\factorygrid`;
- rejects staged secret/runtime paths;
- resets live Revelation to the pushed GitHub commit;
- verifies UAT and Revelation are clean.

## Legacy BlackBeast PowerShell Push
From Windows PowerShell on BlackBeast:

```powershell
D:\UAT\factorygrid\bin\factory-windows-push.ps1 "sync factory changes"
```

That wrapper predates the source-of-truth drift guard and should only be used for legacy recovery. Prefer `factory-sync-source-of-truth.ps1`.

## Full Portable GitHub Push
For a single private GitHub repo that contains the entire portable factory, attach the GitHub remote inside the UAT copy, not the live repo with nested gitlinks:

```bash
cd /mnt/d/UAT/factorygrid
git remote add origin https://github.com/<owner>/<private-repo>.git
git push -u origin main
```

Future ad-hoc full sync:

```bash
cd /home/revelation/factorygrid
bin/factory-secure-backup.sh "sync portable factory"
cd /mnt/d/UAT/factorygrid
git push origin main
```

## Pre-Backup Functional Smoke

Before committing a RuFloUI orchestration change, run a user-visible smoke instead of relying on TypeScript alone:

1. Build RuFloUI from the UAT checkout:

```bash
cd /mnt/d/UAT/factorygrid
./bin/rufloui-build.sh
```

2. Deploy the touched live files to `/home/revelation/factorygrid`, restart `factory_rufloui`, and confirm health.

3. Reinitialize the swarm through the API with `topology=hierarchical`, `strategy=specialized`, and `maxAgents=7`.

4. Confirm `/api/swarm/status` returns Queen plus the six specialists.

5. Submit a task assigned to `swarm` and verify it reaches `completed`.

Reference smoke from 2026-05-27:

- swarm roles: Queen, Architect, Researcher, Coder, Tester, Reviewer, Analyst
- task: `task-1779871888034-2ca023`
- result marker: `QUEEN_SPEC_KIT_VALIDATION_OK`
- validated run: `20260527-spec-kit-queen-smoke-build-0a111ccb`
