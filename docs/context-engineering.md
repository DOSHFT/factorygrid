# Revelation Context Engineering

The stable factory model path is intentionally bounded and stopped by default:

- vLLM model: `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ`
- default profile: `qwen-coder-awq-daily`
- `MAX_MODEL_LEN=8192`
- `MAX_NUM_SEQS=1`
- `ENFORCE_EAGER=true`
- prefix caching enabled
- vLLM is stopped unless a run explicitly starts a model profile

This means the factory must never rely on dumping whole repos, logs, or long research pages into an agent prompt. Every run gets a compact context pack plus exact fetch paths for deeper retrieval.

## Context Pack Schema

Each autonomous run must produce `workspace/.factory-snapshots/<run_id>/context-pack.md`:

```markdown
# Context Pack: <run_id>

## Goal
<user goal in plain language>

## Constraints
- WSL distro: revelation
- Factory root: /home/revelation/factorygrid
- Model: qwen-coder-14b through LiteLLM
- Allowed write paths:
  - <path>

## Active Files
| Path | Reason |
| --- | --- |

## Exact Evidence
| Source | Hash | Excerpt Path | Why It Matters |
| --- | --- | --- | --- |

## Retrieved Memories
| Key | Score | Summary |
| --- | --- | --- |

## Assumptions
| Assumption | Confidence | Validation Command |
| --- | --- | --- |

## Validation Commands
- <command>
```

## Context Rules

- Verify that referenced files and services exist before assigning work.
- Re-check current documentation for drift-prone facts, product/API behavior, models, prices, laws, or security guidance.
- Tool output longer than 200 lines must be summarized and saved as an artifact.
- Logs must be tailed, filtered, or searched before model ingestion.
- Research claims require source URL and fetch timestamp.
- Every research artifact must include title, extractor, fetched_at, source hash, summary path, and originating task id.
- Protected files require a HITL gate before execution continues.
- Agents can request more context, but must request exact paths or source ids.
- Qdrant stores provenance-rich memory records; it must not store untraceable summaries.
- Memory-derived claims are not proof. Drift-prone memories must be verified before implementation.
- Model startup is an explicit tool effect. Do not auto-start heavy models just because a local model path is unavailable.

## Context Pack Gate

Before a Coder starts implementation, Queen or Architect must provide:

- `run_id`
- allowed write paths
- protected-file decision
- model profile to use, or `none`
- backup requirement
- validation commands
- rollback instructions
- source manifest path for researched claims

## Context Mode Evaluation

`mksglu/context-mode` is the first external candidate because it provides context-window optimization, sandboxed command output, URL fetch/index, search, stats, and install diagnostics.

Run:

```bash
cd /home/revelation/factorygrid
bin/evaluate-context-mode.sh
```

Accept it into the production path only after:

- `ctx_doctor` passes in the `revelation` WSL distro.
- It works with Node 20.
- A RuFlo/OpenHands comparison run shows smaller prompt input without losing required evidence.
- It does not bypass the protected-edit gate.
