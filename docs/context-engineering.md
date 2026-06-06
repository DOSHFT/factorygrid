# Revelation Context Engineering

Last verified: 2026-06-06

FactoryGrid runs on a bounded local model path. The live inference stack is:

- vLLM in WSL `Revelation`
- model: `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ`
- LiteLLM aliases: `qwen-coder-14b`, `qwen-coder-14b-anthropic`, `mode-a-research`, `local-qwen`
- `MAX_MODEL_LEN=32768`
- `MAX_NUM_SEQS=4`
- prefix caching enabled
- Hermes tool-call compatibility enabled through `--enable-auto-tool-choice --tool-call-parser hermes`

This stack must not rely on dumping whole repositories, long logs, or raw research crawls into prompts. Every run gets a compact context pack and exact artifact paths for follow-up retrieval.

## Execution Planes

| Plane | Context Responsibility |
| --- | --- |
| Windows host | operator browser, portproxy, `D:\Hermes-Desktop`, Git/PowerShell operations |
| WSL `Revelation` | source workspace, vLLM, LiteLLM, RuFlo, RuFloUI, memory stores, Docker services |
| WSL `decima-intelligence-it` | Hermes dashboard, Hermes CLI, claude-code CLI, Decima research context |

Cross-plane context must name the owning plane. For example, Hermes dashboard state belongs to Decima; RuFlo memory and vLLM state belong to Revelation.

## Context Pack Schema

Each autonomous run must produce `workspace/.factory-snapshots/<run_id>/context-pack.md`:

```markdown
# Context Pack: <run_id>

## Goal
<user goal in plain language>

## Runtime Plane
- Windows host: BlackBeast
- Factory runtime: WSL Revelation, /home/revelation/factorygrid
- Hermes/claude-code runtime: WSL decima-intelligence-it, /home/decima
- Model alias: mode-a-research or qwen-coder-14b through LiteLLM
- vLLM model: Qwen/Qwen2.5-Coder-14B-Instruct-AWQ

## Constraints
- allowed write paths
- protected paths
- network/service assumptions

## Active Files
| Path | Reason |
| --- | --- |

## Exact Evidence
| Source | Hash | Excerpt Path | Why It Matters |
| --- | --- | --- | --- |

## Retrieved Memories
| Key | Score | Summary | Source |
| --- | --- | --- | --- |

## Assumptions
| Assumption | Confidence | Validation Command |
| --- | --- | --- |

## Validation Commands
- <command>
```

## Context Rules

- Tool output longer than 200 lines must be summarized and saved as an artifact.
- Logs must be tailed, filtered, or searched before model ingestion.
- Research claims require source URL and fetch timestamp.
- Protected files require a human-visible gate before execution continues.
- Agents can request more context, but must request exact paths, URLs, source ids, or run ids.
- Qdrant stores provenance-rich memory records; it must not store untraceable summaries.
- Neo4j/Graphiti data is shadow memory while Neo4j health is degraded.
- Decima Hermes and claude-code may call the model through `http://172.20.80.1:4001/v1`; containers call LiteLLM through `http://litellm:4000/v1`.

## Context Mode Evaluation

`mksglu/context-mode` remains an external candidate for context-window optimization. It is not production-authoritative.

Accept it into the production path only after:

- `ctx_doctor` passes in WSL `Revelation`.
- It works with Node 20.
- A RuFlo/OpenHands comparison run shows smaller prompt input without losing required evidence.
- It does not bypass the protected-edit gate.
- Its MCP/env launch path uses the same LiteLLM/vLLM/Qdrant routing as `ruflo_project/.mcp.json`.
