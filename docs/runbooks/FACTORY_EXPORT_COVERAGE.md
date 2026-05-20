# Factory Export Coverage Standard

## Purpose
This document is the checklist for keeping FactoryGrid portable. Whenever a new file, directory, product, agent, hook, runtime store, credential file, model artifact, generated build, or customer-facing script is added, classify it here and update the export scripts if needed.

The active export chain is:

1. `bin/factory-uat-copy.sh` creates the sanitized working copy at `D:\UAT\factorygrid`.
2. `bin/factory-portable-git-sync.sh` commits that full portable copy, including nested `rufloui` source, to `D:\UAT\factorygrid-portable.git`.
3. `bin/factory-secure-backup.sh` runs the UAT copy, portable Git sync, and top-level local Git sync.
4. `bin/factory-windows-push.ps1` runs the secure backup from BlackBeast PowerShell and pushes `D:\UAT\factorygrid` to `https://github.com/DOSHFT/factorygrid`.
5. `bin/factory-export-customer.sh` creates customer handoff artifacts under `D:\UAT\releases`.

## Included Source Classes
These must be included in UAT, GitHub, and customer exports:

- Factory docs: `README.md`, `Architecture.md`, `Guidelines.md`, `instructions.md`, `todo-factory.md`.
- Runbooks and specs: `docs/**` except generated/private runtime notes if later added.
- Docker/runtime definitions: `docker-compose.yml`, `docker/**`, `litellm_config.yaml`, `openhands_config.toml` templates/configs that do not contain secrets.
- Scripts: `bin/**`, including backup/export/deploy scripts.
- Agents and gates: `server/agents/**`, `server/hooks/**`.
- RuFlo project source/config: `ruflo_project/**` excluding runtime databases, daemon state, logs, and dependency folders.
- RuFloUI source: `rufloui/**` excluding `.git`, `node_modules`, `dist`, and TypeScript build info.
- Product roots: each shippable product directory, currently `FIXReaper/**`, excluding product runtime output.
- Factory Brain source-of-truth artifacts: `workspace/factory-brain/**`.
- Spec Kit artifacts: `workspace/spec-kit/**`.
- Research, architecture, testing reports that are safe and redacted: `workspace/research/**`, `workspace/architecture/**`, `workspace/testing/**`.
- Protocol dictionaries that are not proprietary/customer-secret: `workspace/protocols/**`, `FIXReaper/protocols/**`.

## Excluded Runtime or Secret Classes
These must not be included in GitHub or customer exports:

- `.env`, `.env.*`, except `.env.example` templates.
- OpenHands runtime and secrets: `openhands_state/**`.
- Qdrant runtime database: `qdrant_storage/**`.
- Logs: `logs/**`, `*.log`.
- DR snapshots: `workspace/dr/**`.
- Temporary/cache folders: `workspace/tmp/**`, `workspace/cache/**`, `.cache/**`, `__pycache__/**`, `.pytest_cache/**`.
- Dependency folders: `node_modules/**`, nested `**/node_modules/**`, `.venv/**`, `venv/**`.
- Generated frontend/backend builds: `dist/**`, `build/**`, `rufloui/tsconfig.tsbuildinfo`.
- RuFlo runtime state: `ruflo_project/.claude-flow/daemon-state.json`, `ruflo_project/.claude-flow/metrics/**`, `ruflo_project/.claude-flow/swarm/**`, `ruflo_project/.rufloui/**`, `ruflo_project/.swarm/**`, `ruflo_project/agentdb.rvf*`, `ruflo_project/ruvector.db`.
- Product runtime output: `FIXReaper/runtime/**`.
- Secrets or credential files by name: `*secret*`, `*secrets*`, `*credential*`, `*credentials*`, `*.token`, `*.jwt`, `*.pem`, `*.key`, `*.p12`, `*.pfx`.
- Large model/data blobs: `*.safetensors`, `*.gguf`, `*.pt`, `*.pth`, `*.onnx`, `*.bin`, `*.parquet`, `*.arrow`.

## Add-New-File Checklist
When adding a new path, do this before backup/export:

1. Decide whether it is source, documentation, product artifact, generated output, runtime state, or secret material.
2. If it is source or safe documentation, ensure it is not blocked by `.gitignore` or `bin/factory-uat-copy.sh` excludes.
3. If it is runtime, generated, large, or secret-bearing, add it to `.gitignore` and `bin/factory-uat-copy.sh` excludes.
4. If it belongs to a product, keep it under that product root and update that product's `BOM.md`, `docs/Architecture.md`, and `docs/fix_lessons-learned.md` or equivalent lessons file.
5. If it changes customer restore behavior, update `docs/runbooks/CUSTOMER_WSL_DEPLOYMENT.md` and `RESTORE_UAT.md` generation in `bin/factory-uat-copy.sh`.
6. Run the verification commands below.

## Verification Commands
Run from the live Revelation factory:

```bash
cd /home/revelation/factorygrid
bin/factory-secure-backup.sh "sync factory changes"
bin/factory-export-customer.sh /mnt/d/UAT/releases
```

Scan the portable copy for obvious leaks:

```bash
find /mnt/d/UAT/factorygrid -maxdepth 5 \
  \( -name .env -o -path '*/openhands_state*' -o -path '*/qdrant_storage*' -o -path '*/logs*' -o -name node_modules -o -name '*secret*' -o -name '*credential*' \) -print
```

The only acceptable `.env` in an installed test target is one generated locally from `.env.example`; it must not be in the export source copy.

Smoke-test the latest customer `.run`:

```bash
LATEST=$(ls -t /mnt/d/UAT/releases/factorygrid-customer-*.run | head -n 1)
rm -rf /tmp/customer-factorygrid
"$LATEST" --target /tmp/customer-factorygrid --skip-deps --force
test -f /tmp/customer-factorygrid/rufloui/package.json
test -f /tmp/customer-factorygrid/FIXReaper/BOM.md
```

## Current Customer Restore Shape
A customer can install from the `.run` artifact with:

```bash
chmod +x factorygrid-customer-<timestamp>.run
./factorygrid-customer-<timestamp>.run --target $HOME/factorygrid
cd $HOME/factorygrid
nano .env
docker compose up -d
./bin/factory-doctor.sh
```

## Known Operational Notes
- `http://localhost:28588/factory` is the primary UI.
- `http://localhost:28580/` redirects to `http://localhost:28588/factory`; `28580` remains the API/WebSocket server.
- RuFlo MCP health is verified by `ruflo mcp health` inside the container. Direct raw HTTP curls to port `3010` may reset depending on the MCP transport behavior and should not be used as the authoritative health check.
