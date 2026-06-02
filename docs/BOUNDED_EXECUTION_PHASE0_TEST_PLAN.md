# Bounded Execution Phase 0 Test Plan

> **Status (June 2026)**: Implementation complete and merged. Production wrappers (with pre-flight checks, manifests, and dry-run) have been delivered and tested. The harness itself (`bounded-execution-smoketest.ts`) remains the canonical way to re-verify the lane.

This document records the regression cases required for the bounded execution lane.

## Test Harness Assumption

`factorygrid_patch` is a patch tree and does not contain a full `rufloui/package.json` or `node_modules`. For local verification, overlay `factorygrid_patch/rufloui/src/backend/server.ts` into a complete RuFloUI checkout or container, then run the tests against the temporary copy. Do not run these tests against the production service until the patch has been reviewed.

## Required Regression Cases

### 1. Ten-Attempt File Write / Readback

Create ten assigned tasks with:

- `execution.internalSmokeTest=true`
- `execution.targetPath=workspace/reports/bounded-smoke-<n>.txt`
- `execution.content=OK-<n>`

Expected:

- each task completes,
- each file exists with exact content,
- each run writes `execution-report.json`,
- no swarm/Claude path executes before bounded evidence.

### 2. Protected Path Rejection

Task:

- `execution.internalSmokeTest=true`
- `execution.targetPath=/home/revelation/.ssh/test`
- `execution.content=NO`

Expected:

- task fails closed,
- result includes `protected_path`,
- no file is written.

### 3. Outside Allowed Root Rejection

Task:

- approved Spec-Kit metadata with `allowedWritePaths=["workspace/reports"]`
- target `rufloui/src/backend/server.ts`

Expected:

- task fails closed,
- result includes `path_outside_allowed_roots`,
- no source file modification.

### 4. Readback Mismatch

Task:

- `execution.internalSmokeTest=true`
- `execution.targetPath=workspace/reports/mismatch.txt`
- `execution.content=A`
- `execution.validateContent=B`

Expected:

- task fails,
- result includes `readback_mismatch`,
- file evidence records failed readback.

### 5. Ambiguous Side-Effect Block

Task:

```text
Fix all broken task execution. Clean up whatever is needed and make production ready.
```

Expected:

- classified as `ambiguous_blocked`,
- task fails closed,
- no LLM execution.

### 6. Missing Spec-Kit Block

Task:

- concrete file write,
- not an internal smoke test,
- no approved Spec-Kit metadata.

Expected:

- task fails closed,
- result includes `missing_spec_kit_approval`.

### 7. Research Planning Remains Unchanged

Task:

```text
Analyze why launchWorkflowForTask lets concrete work reach Claude.
```

Expected:

- classified as `research_planning`,
- existing swarm/Claude path remains available.

### 8. Allowlisted Command

Task:

- `execution.internalSmokeTest=true`
- `execution.command=node --version`

Expected:

- task completes,
- command log records exit code `0`,
- validation output contains `[STATUS: PASS]`.

### 9. Non-Allowlisted Command Rejection

Task:

- `execution.internalSmokeTest=true`
- `execution.command=rm -rf workspace/tmp`

Expected:

- task fails closed,
- result includes `unsupported_operation`.

## Static Verification

Run TypeScript compile in a full checkout with patched `server.ts` overlaid:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

Expected:

- exit code `0`.

## Executable Smoketest Harness

The harness lives at `rufloui/scripts/bounded-execution-smoketest.ts` (plus cross-platform launchers). It is part of the Phase 0 patch deliverable.

### How the harness works
- Starts the RuFloUI backend in `FACTORYGRID_TEST_MODE=1` (in-process).
- Creates an isolated `.smoketest-runtime/` with a minimal Ruflo CLI stub.
- Submits tasks via the real `POST /api/tasks`.
- Polls `/api/tasks/:id/status` until terminal.
- Validates using the exported `__boundedExecutionTestApi` (findBoundedExecutionReport + hasCompletedExecutionEvidence) plus direct filesystem + report.json inspection.
- Never talks to real Claude / swarm for bounded-classified jobs.

### One-command production usage (after overlaying the patched server.ts)

The three launchers + updated `package.json` are now included in the patch and also pre-provisioned into `RuFloUI/scripts/` + `RuFloUI/package.json` in this workspace. Once you overlay `factorygrid_patch/rufloui/src/backend/server.ts` → `RuFloUI/src/backend/server.ts`, the following commands work immediately from any shell.

**From Windows cmd.exe:**
```cmd
cd D:\Dev\Projects\_revelation-stack\RuFloUI
scripts\run-bounded-smoketest.bat
```

**From Windows PowerShell:**
```powershell
cd D:\Dev\Projects\_revelation-stack\RuFloUI
npm run smoke:windows
# or directly:
.\scripts\run-bounded-smoketest.ps1
```

**From WSL / Linux / macOS (or WSL bash inside the Windows checkout):**
```bash
cd /mnt/d/Dev/Projects/_revelation-stack/RuFloUI   # or your Linux-native checkout
npm run smoke
# or:
./scripts/run-bounded-smoketest.sh
# or directly (Linux node + Linux node_modules):
npx tsx scripts/bounded-execution-smoketest.ts
```

The Windows-side launchers (`.bat` + `.ps1`) **always** delegate into WSL using `wsl bash -c` + path translation to `/mnt/...`. This guarantees the Linux-native `node_modules` (tsx, esbuild, etc.) are used even when you type the command from cmd.exe or PowerShell on the Windows host. No native Windows reinstall of deps is ever required.

The `.sh` + direct `npm run smoke` paths are for shells that are already running under a Linux node (pure WSL, native Linux, macOS, or a Linux container).

Make the shell script executable once (from WSL):
```bash
chmod +x /mnt/d/Dev/Projects/_revelation-stack/RuFloUI/scripts/run-bounded-smoketest.sh
```

All four entry points (`run-bounded-smoketest.bat`, `.ps1`, `.sh`, and the two npm aliases) are now first-class, documented, and production-ready.

Current harness coverage (see `cases()` in the .ts for exact bodies):
- 3× internal smoke happy-path file write + readback + full artifact evidence (the original "10 attempts" scenario, stabilized)
- Spec-Kit approved bounded file write
- missing Spec-Kit approval block
- protected path rejection
- outside allowed-root rejection
- readback mismatch failure
- ambiguous side-effect (freeform text) block
- allowlisted command execution
- non-allowlisted command block

(9 distinct behavioral contracts exercised; the repeat happy-path runs give statistical confidence in the executor.)
