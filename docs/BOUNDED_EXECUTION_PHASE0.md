# Phase 0: Bounded Execution Lane (Implemented)

> **Status (June 2026)**: Fully implemented and permanently merged into the live production `RuFloUI/src/backend/server.ts`. Associated smoketest harness has been hardened with cross-platform production wrappers (`factory-mode-a-research` family) and successfully validated in dry-run. See `MODE_A_CLAUDE_CODE_ARTIFACT_FORGE.md` for how this lane now serves as the safe execution sink for Mode A research output.

## 0. Purpose

This document originally defined a narrow bounded execution lane for FactoryGrid concrete side-effect tasks. The implementation is now complete.

The specific failure being addressed is the task pipeline allowing a simple verifiable job, such as the 10-attempt file write/readback task `task-1779997058737-56d85d`, to drift into LLM planning/exploration instead of executing the requested side effect.

Phase 0 adds classification, deterministic bounded execution, evidence artifacts, and guards so bounded jobs cannot enter the swarm/Claude path before evidence exists.

No implementation is included in this document.

---

## 1. Task Classification Rules

Classification must happen before `launchWorkflowForTask()` chooses the swarm or Claude fallback path.

Classes:

```text
bounded_execution
research_planning
ambiguous_blocked
```

### 1.1 Classification Logic

Pseudocode:

```text
classifyTask(task):
  text = normalized(title + description + metadata)

  has_side_effect =
    text requests create/write/modify/patch/generate file
    OR text requests run/build/test/restart/start/stop/check command

  has_specific_target =
    text includes explicit path
    OR text includes explicit known command
    OR task metadata includes target path/command

  has_verification =
    text mentions verify/readback/check/test/health/diff/exit code
    OR task metadata includes expectedOutputs

  broad_or_unsafe =
    text contains vague work such as:
      "fix everything"
      "clean up"
      "whatever is needed"
      "make production ready"
      "delete old"
      "repair all broken"
      "do all necessary changes"

  research_only =
    text asks for analyze/research/review/compare/design/explain/propose/summarize
    AND has_side_effect is false

  if has_side_effect AND has_specific_target AND has_verification AND NOT broad_or_unsafe:
    return bounded_execution

  if research_only:
    return research_planning

  return ambiguous_blocked
```

### 1.2 Bounded Execution Examples

Classify as `bounded_execution`:

- "Create `workspace/reports/bounded-smoke.txt` with content `OK` and verify readback."
- "Run `npm run build` in `factorygrid_patch/rufloui` and capture exit code."
- "Write `workspace/reports/spec-kit-smoke.md` from approved Spec-Kit metadata and verify the file exists."
- "Patch this specific file inside approved paths and run the allowlisted validation command."

### 1.3 Research / Planning Examples

Classify as `research_planning`:

- "Analyze why task execution is failing."
- "Review `server.ts` and explain the current swarm flow."
- "Produce a design proposal for bounded execution."
- "Compare the current runtime to `capability_matrix.md`."

### 1.4 Ambiguous / Blocked Examples

Classify as `ambiguous_blocked`:

- "Fix all broken tasks."
- "Clean up whatever is not needed."
- "Make Ruflo production-ready."
- "Delete old junk."
- "Patch whatever is necessary."

### 1.5 Fail-Closed Rule

Any task requesting side effects but lacking specific target, verification, allowed scope, or approved Spec-Kit metadata must be blocked.

It must not fall back to LLM planning.

---

## 2. Spec-Kit Precondition Model

Spec-Kit intake and Queen validation are treated as existing and valid.

A bounded job may proceed only if it has approved execution metadata or is explicitly marked as an internal bounded smoke test.

### 2.1 Required Spec-Kit Metadata

Minimum required fields:

```json
{
  "specId": "string",
  "runId": "string",
  "approvalStatus": "QUEEN_SPEC_KIT_VALIDATION_OK",
  "approvedAt": "ISO-8601 string",
  "specPath": "string",
  "checklistPath": "string",
  "allowedWritePaths": ["string"],
  "protectedPaths": ["string"],
  "expectedOutputs": [
    {
      "type": "file | command | readback | healthcheck",
      "target": "string",
      "expected": "string"
    }
  ]
}
```

### 2.2 Proceed Conditions

A bounded job proceeds only when:

- classification is `bounded_execution`,
- approved Spec-Kit metadata is present,
- `approvalStatus` is exactly `QUEEN_SPEC_KIT_VALIDATION_OK`,
- allowed write paths are non-empty for write operations,
- expected outputs are present,
- target paths resolve inside allowed roots,
- target paths do not overlap protected paths.

### 2.3 Block Conditions

Block with `missing_spec_kit_approval` when:

- bounded job lacks approved metadata,
- approval status is missing or not `QUEEN_SPEC_KIT_VALIDATION_OK`,
- expected outputs are missing,
- allowed write paths are missing for write operations.

Internal smoke-test exception:

- May bypass Spec-Kit only if explicitly marked as internal smoke/self-test.
- Must still use bounded execution.
- Must still produce full artifacts.
- Must use tightly scoped allowed paths under `factorygrid_patch/workspace/execution-runs/` or `factorygrid_patch/workspace/reports/`.

---

## 3. Bounded Executor Behavior

The bounded executor is deterministic. It does not ask an LLM how to perform the side effect.

### 3.1 Supported Operations In Phase 0

Only these operations are in scope:

```text
write_file
read_file
run_allowlisted_command
capture_git_diff
capture_file_hash
write_artifacts
```

Details:

- `write_file`: create or overwrite a file inside allowed roots.
- `read_file`: read back content for verification.
- `run_allowlisted_command`: run a small allowlist of validation commands.
- `capture_git_diff`: capture diff for touched files only.
- `capture_file_hash`: SHA-256 before and after write.
- `write_artifacts`: write structured evidence into the execution run directory.

### 3.2 Initial Command Allowlist

Phase 0 command allowlist:

```text
npm run build
npm test
npm run test
node --version
npm --version
git diff -- <allowed path>
git status --short
```

No arbitrary shell.

Commands must be executed without shell expansion where possible.

### 3.3 Path Enforcement Rules

All paths must be:

- normalized,
- resolved to absolute paths,
- checked for traversal,
- checked against allowed roots,
- checked against protected paths.

Rules:

```text
default deny all writes
reject paths containing traversal after normalization
reject writes outside allowedWritePaths
reject protected paths even if under allowed root
reject symlink escapes
reject absolute paths unless explicitly inside allowed root
```

Protected examples:

```text
.env
*.pem
*.key
.ssh
docker-compose.yml
litellm_config.yaml
openhands_state/settings.json
bin/start-vllm-factory.sh
model launchers
dependency manifests and lockfiles unless explicitly approved
credentials
secret stores
```

### 3.4 Explicitly Not Allowed In Phase 0

The executor must not:

- delete files,
- move files,
- recursively edit directories,
- run arbitrary shell,
- run Docker commands,
- restart services,
- touch GPU/vLLM controls,
- modify protected infrastructure files,
- perform broad refactors,
- invoke Claude/LLM as the primary executor,
- mark success from LLM output,
- bypass Spec-Kit approval for normal bounded jobs.

---

## 4. Artifact Contract

Every bounded execution run writes artifacts under:

```text
factorygrid_patch/workspace/execution-runs/<run_id>/
```

Required files:

```text
execution-report.json
execution-report.md
file-evidence.json
command-log.jsonl
validation-output.txt
spec-kit-reference.json
```

### 4.1 `execution-report.json`

Schema:

```json
{
  "schemaVersion": "factorygrid.execution.v1",
  "taskId": "string",
  "runId": "string",
  "taskClass": "bounded_execution",
  "status": "completed | failed | blocked",
  "gateStatus": "gate_ready_not_run",
  "startedAt": "ISO-8601 string",
  "finishedAt": "ISO-8601 string",
  "summary": "string",
  "specKit": {
    "required": true,
    "approvalStatus": "QUEEN_SPEC_KIT_VALIDATION_OK | not_required_smoke_test | missing",
    "specId": "string",
    "specPath": "string",
    "checklistPath": "string"
  },
  "constraints": {
    "allowedWritePaths": ["string"],
    "protectedPaths": ["string"]
  },
  "classification": {
    "class": "bounded_execution",
    "reason": "string"
  },
  "actions": [
    {
      "type": "write_file | read_file | run_allowlisted_command | capture_git_diff | capture_file_hash",
      "target": "string",
      "startedAt": "ISO-8601 string",
      "finishedAt": "ISO-8601 string",
      "result": "ok | failed | blocked",
      "exitCode": 0,
      "stdoutPath": "string",
      "stderrPath": "string"
    }
  ],
  "filesChanged": [
    {
      "path": "string",
      "operation": "created | modified",
      "sha256Before": "string | null",
      "sha256After": "string",
      "readbackVerified": true
    }
  ],
  "validation": {
    "result": "passed | failed | not_run",
    "checks": [
      {
        "name": "string",
        "type": "file_exists | content_match | command_exit | diff_captured",
        "target": "string",
        "expected": "string",
        "actual": "string",
        "passed": true
      }
    ]
  },
  "failure": {
    "code": "missing_spec_kit_approval | ambiguous_task | protected_path | path_outside_allowed_roots | unsupported_operation | command_failed | readback_mismatch | validation_failed",
    "message": "string"
  }
}
```

`failure` is required when `status` is `failed` or `blocked`.

### 4.2 `execution-report.md`

Human-readable summary containing:

```text
Task ID
Run ID
Classification
Spec-Kit approval status
Allowed paths
Protected paths
Actions performed
Files changed
Validation results
Final status
Failure reason if applicable
```

### 4.3 `file-evidence.json`

Schema:

```json
{
  "schemaVersion": "factorygrid.fileEvidence.v1",
  "runId": "string",
  "files": [
    {
      "path": "string",
      "resolvedPath": "string",
      "operation": "created | modified | read",
      "existsBefore": true,
      "existsAfter": true,
      "sha256Before": "string | null",
      "sha256After": "string | null",
      "expectedContentHash": "string | null",
      "actualContentHash": "string | null",
      "readbackVerified": true
    }
  ]
}
```

### 4.4 `command-log.jsonl`

One JSON object per command:

```json
{
  "timestamp": "ISO-8601 string",
  "runId": "string",
  "command": ["npm", "run", "build"],
  "cwd": "string",
  "allowed": true,
  "exitCode": 0,
  "stdoutPath": "string",
  "stderrPath": "string",
  "durationMs": 1234
}
```

### 4.5 `validation-output.txt`

Raw validation output. Must include:

```text
[STATUS: PASS|FAIL]
[EXIT_CODE: <number>]
```

When validation fails, include enough output to diagnose without relying on model narration.

### 4.6 `spec-kit-reference.json`

Schema:

```json
{
  "schemaVersion": "factorygrid.specKitReference.v1",
  "runId": "string",
  "specId": "string",
  "approvalStatus": "QUEEN_SPEC_KIT_VALIDATION_OK | not_required_smoke_test | missing",
  "specPath": "string",
  "checklistPath": "string",
  "approvedAt": "ISO-8601 string",
  "expectedOutputs": []
}
```

### 4.7 Meaning Of `completed`

`status: completed` requires all of the following:

- classification is `bounded_execution`,
- Spec-Kit approval is valid or smoke-test exemption is explicit,
- all required artifact files exist,
- no protected path touched,
- all writes stayed inside allowed roots,
- readback verification passed for file writes,
- allowlisted commands exited successfully when required,
- validation result is `passed`,
- `gateStatus` is `gate_ready_not_run`,
- no LLM path was used as primary executor.

---

## 5. Concrete `server.ts` Integration Sketch

Primary file:

```text
factorygrid_patch/rufloui/src/backend/server.ts
```

Relevant locations:

```text
launchWorkflowForTask() around line 1026
launchSwarmPipeline() around line 1126
runClaude() nested around line 1148
tool_use handling around line 1186
task create route around line 2187
task assign route around line 2228
webhook task paths around lines 3259, 3318, 3331, 3392
```

### 5.1 New Types / Helpers

Add near task execution helpers, before `launchWorkflowForTask()`:

```text
TaskClass
BoundedExecutionRequest
SpecKitExecutionInput
ExecutionReport
classifyTaskForExecution()
resolveSpecKitExecutionInput()
isInternalSmokeTask()
hasExecutionEvidence()
writeBlockedExecutionReport()
launchBoundedExecutionForTask()
```

These are structural additions, not swarm refactors.

### 5.2 `launchWorkflowForTask()`

Current role:

- creates workflow,
- chooses multi-agent swarm if active,
- otherwise calls Claude fallback.

New first step:

```text
launchWorkflowForTask(taskId, title, description):
  task = taskStore.get(taskId)
  if no task: return

  classification = classifyTaskForExecution(task, title, description)

  persist classification on task metadata if available

  if classification == ambiguous_blocked:
    writeBlockedExecutionReport(...)
    set task.status = failed or blocked-compatible status
    broadcast task update
    return

  if classification == bounded_execution:
    launchBoundedExecutionForTask(...)
    return

  continue existing research_planning behavior:
    create workflow
    choose swarm or Claude fallback
```

Conservative status assumption:

- If task store has no `blocked` status support, use `failed` with result text beginning `BLOCKED:`.
- Do not invent broad UI changes in Phase 0.

### 5.3 `launchBoundedExecutionForTask()`

Structural flow:

```text
launchBoundedExecutionForTask(taskId, task, title, description):
  create runId
  create execution run directory

  load/resolve Spec-Kit metadata
  if missing and not internal smoke:
    write blocked artifacts
    update task as failed/blocked
    return

  build bounded request from metadata/task
  enforce allowed/protected path policy
  if policy violation:
    write blocked artifacts
    update task as failed/blocked
    return

  execute supported operations only
  capture file hashes/readback
  run allowlisted validation commands if requested
  capture command logs
  write all required artifacts

  if validation passed:
    mark task completed
  else:
    mark task failed

  broadcast task update
```

No LLM call inside this function before evidence exists.

### 5.4 `launchSwarmPipeline()`

At the top of `launchSwarmPipeline()`:

```text
if task is classified bounded_execution and hasExecutionEvidence(taskId) is false:
  write/broadcast refusal
  throw or return failed state
```

Purpose:

- defense in depth,
- prevents future accidental direct calls,
- keeps bounded side-effect work out of the coordinator planner.

### 5.5 `runClaude()`

Inside nested `runClaude()` before spawning Claude:

```text
if task is bounded_execution and hasExecutionEvidence(taskId) is false:
  reject with "bounded execution cannot use Claude as primary executor"
```

Allowed after evidence:

- summary,
- review,
- failure explanation,
- next-task proposal.

Not allowed:

- primary write/patch/run execution.

### 5.6 `tool_use` Handling

Current `tool_use` stream events create workflow steps.

Phase 0 rule:

```text
tool_use events are telemetry only.
They are not evidence for bounded execution completion.
```

No broad parser rewrite required.

### 5.7 Task Routes

Task creation route around `server.ts:2187`:

- classify at creation time if enough data is present,
- store classification metadata where compatible,
- do not execute immediately unless assignment triggers existing behavior.

Task assign route around `server.ts:2228`:

- when assignment triggers `launchWorkflowForTask()`, classification will be enforced there,
- optionally include classification in response for visibility.

Webhook task paths:

- no separate executor path,
- they still go through `launchWorkflowForTask()`,
- bounded classification applies there too.

---

## 6. Gate Integration Stance

Phase 0 chooses artifact-only gate integration.

The bounded executor will produce gate-ready artifacts but will not call Python gates directly in Phase 0.

Reasoning:

- keeps Phase 0 minimal,
- avoids adding cross-runtime coupling before the bounded lane is proven,
- preserves existing gate philosophy,
- gives later gate integration deterministic inputs.

`execution-report.json` must include:

```json
{
  "gateStatus": "gate_ready_not_run"
}
```

No report may claim Python gates passed unless they were actually invoked in a later approved phase.

Gate-ready means artifacts contain enough data for later consumption by:

```text
gate_architecture.py
gate_diff_scope.py
gate_validation.py
gate_review.py
```

Phase 0 does not weaken or bypass gates. It creates reliable evidence for them.

---

## 7. Test Plan

All tests must be reproducible.

### 7.1 Original 10-Attempt File Write/Readback Scenario

Submit the same bounded file write/readback task 10 times.

Expected:

- each run writes the file,
- each run verifies readback,
- each run writes all required artifacts,
- each run completes deterministically,
- no LLM/swarm path is used before evidence.

### 7.2 Protected Path Rejection

Task attempts to write:

```text
/home/revelation/.ssh/test
```

Expected:

- status blocked/failed with `protected_path`,
- no file written,
- blocked execution report exists.

### 7.3 Outside Allowed Root Rejection

Spec allows:

```text
factorygrid_patch/workspace/reports/
```

Task targets:

```text
factorygrid_patch/rufloui/src/backend/server.ts
```

Expected:

- blocked with `path_outside_allowed_roots`,
- no modification.

### 7.4 Readback Mismatch

Task writes content `A` but expected output says content `B`.

Expected:

- bounded executor detects mismatch,
- status `failed`,
- failure code `readback_mismatch`,
- file evidence records actual hash/content check failure.

### 7.5 Ambiguous Side-Effect Task

Task:

```text
Fix all broken task execution and clean up whatever is needed.
```

Expected:

- `ambiguous_blocked`,
- no LLM execution,
- blocked report written.

### 7.6 Research Task Still Uses Existing Path

Task:

```text
Analyze why launchWorkflowForTask lets concrete work reach Claude.
```

Expected:

- classified `research_planning`,
- existing swarm/Claude path still allowed,
- no bounded executor.

### 7.7 Bounded Doc Artifact

Approved Spec-Kit metadata asks for:

```text
workspace/reports/spec-kit-smoke.md
```

Expected:

- file created,
- hash recorded,
- readback verified,
- artifacts complete.

### 7.8 Allowlisted Build Command

Approved Spec-Kit metadata asks for:

```text
npm run build
```

inside:

```text
factorygrid_patch/rufloui
```

Expected:

- command allowed,
- stdout/stderr captured,
- exit code captured,
- status follows exit code,
- command-log entry written.

### 7.9 Non-Allowlisted Command Rejection

Task asks for:

```text
rm -rf workspace/tmp
```

Expected:

- blocked with `unsupported_operation`,
- no command executed.

### 7.10 Post-Evidence LLM Summary

After completed bounded run, optional summary is requested.

Expected:

- LLM may summarize `execution-report.json`,
- task completion status remains based on deterministic artifacts,
- LLM output is not treated as execution evidence.

---

## 8. Exact Files Expected To Change

### 8.1 Required Code Changes

```text
factorygrid_patch/rufloui/src/backend/server.ts
```

Changes:

- add classification types/helpers,
- add Spec-Kit metadata resolver,
- add bounded executor entry point,
- add artifact writers,
- add path policy helpers,
- integrate early classification in `launchWorkflowForTask()`,
- add guard in `launchSwarmPipeline()`,
- add guard in nested `runClaude()`,
- add task route classification metadata where minimal.

### 8.2 Required Tests

Likely location, depending on existing test conventions:

```text
factorygrid_patch/rufloui/src/backend/__tests__/bounded-executor.test.ts
```

or equivalent existing backend test directory.

Changes:

- classifier tests,
- path policy tests,
- artifact writer tests,
- bounded execution smoke tests.

### 8.3 Required Documentation

```text
factorygrid_patch/docs/BOUNDED_EXECUTION_PHASE0.md
```

Changes:

- store this approved design,
- document operation scope,
- document artifact contract,
- document test procedure.

### 8.4 Optional Minimal Visibility

No UI work is planned.

If needed only for basic operator visibility, task result strings may include artifact path. No new page/panel in Phase 0.

---

## 9. Rollout & Review Gates

Implementation must proceed in small approved chunks.

### Gate 0: Proposal Approval

Human reviews this proposal.

No code until explicit approval.

### Chunk 1: Classifier Only

Files:

```text
server.ts
classifier tests
```

Deliver:

- classification helper,
- tests for bounded/research/ambiguous,
- no routing change yet.

Stop for approval.

### Chunk 2: Artifact Schema + Writers

Files:

```text
server.ts or small helper module
artifact tests
docs
```

Deliver:

- execution run directory writer,
- blocked report writer,
- schema-compliant artifact generation.

Stop for approval.

### Chunk 3: Path Policy + Bounded Operations

Files:

```text
server.ts or helper module
tests
```

Deliver:

- path normalization,
- allowed/protected checks,
- write/readback,
- command allowlist,
- hash capture.

Stop for approval.

### Chunk 4: `launchWorkflowForTask()` Integration

Files:

```text
server.ts
integration tests
```

Deliver:

- bounded tasks route to executor,
- ambiguous tasks block,
- research tasks continue existing path.

Stop for approval.

### Chunk 5: Swarm/Claude Guards

Files:

```text
server.ts
tests
```

Deliver:

- `launchSwarmPipeline()` guard,
- `runClaude()` guard,
- tool_use telemetry clarification.

Stop for approval.

### Chunk 6: Regression Test Pass

Run required test plan.

Deliver:

- command output,
- artifact paths,
- proof original 10-attempt scenario is fixed,
- proof protected-path and ambiguous cases fail closed.

Stop for final signoff.

---

## 10. Scope Discipline & Out-of-Scope Items

This phase deliberately does not solve:

- full Spec-Kit-to-execution automation,
- direct Python gate invocation,
- UI redesign,
- memory system changes,
- vLLM/GPU controls,
- Docker/service restart automation,
- broad swarm refactor,
- role renaming,
- real Claude Code Mode A integration,
- arbitrary shell execution,
- deletion/move operations,
- production infrastructure edits,
- lockfile/dependency changes unless separately approved.

The smallest effective intervention is:

```text
classify before LLM
block ambiguous side effects
execute bounded jobs deterministically
write evidence artifacts
guard swarm/Claude against pre-evidence bounded work
```

That is the full Phase 0 boundary.
