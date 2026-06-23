# Agent Workspace Guardrails

Last verified: 2026-06-23

## Purpose

FactoryGrid autonomous writes must be attributable, bounded, and reversible. The first enforced path is the RuFloUI deterministic bounded file-write task path.

## Policy

- Autonomous writes must resolve under the FactoryGrid workspace.
- Allowed write prefixes default to `workspace/`.
- Operators may narrow the allowlist with `FACTORY_AGENT_ALLOWED_WRITE_PREFIXES`, comma separated.
- Protected config and dependency paths require explicit human approval before autonomous writes.
- Every accepted bounded write creates a pre-write snapshot under `workspace/guardrails/snapshots/<snapshot_id>/`.

## Protected Paths

RuFloUI uses the protected path classifier exposed at:

```text
GET /api/system/protected-files
GET /api/workspace/guardrails
```

Protected examples include:

- `.env` and `.env.*`
- `docker-compose.yml`
- package/dependency manifests and lockfiles
- `litellm_config.yaml`
- OpenHands settings
- vLLM launcher config

## Snapshot Contents

Each snapshot includes:

- `snapshot.md`: task id, reason, target path, HEAD, pre-run status, rollback instructions
- `pre-run.diff`: binary-safe tracked diff captured before the write

The snapshot is written before the target file is changed.

## Rollback

Follow the snapshot-specific instructions first. The normal rollback flow is:

```bash
git apply -R workspace/guardrails/snapshots/<snapshot_id>/pre-run.diff
git diff -- <target-path>
git restore -- <target-path>
```

If the target file was newly created and should not remain, remove that file manually after inspection.

## Current Scope

Implemented now:

- deterministic RuFloUI bounded file-write task path
- path allowlist
- protected path refusal with HITL-required result
- pre-write git snapshot artifact
- rollback instructions in workflow result

Still required for full P0 closure:

- OpenHands workspace write boundary enforcement
- external tool write gate integration
- human approval workflow for protected config edits
