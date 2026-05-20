# FactoryGrid UAT Copy and GitHub Backup

## Scope
The factory repository is the source of truth for orchestration code, RuFlo agent definitions, hooks, product roots such as `FIXReaper/`, docs, specs, and recovery scripts.

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
