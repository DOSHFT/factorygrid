# FactoryGrid Workflow Spec

Last verified: 2026-06-06

This is the operating contract for the local FactoryGrid software factory. The live system is split across three execution planes:

| Plane | Owner | Purpose |
| --- | --- | --- |
| Windows host `BlackBeast` | PowerShell + Desktop | LAN portproxy, browser access, `D:\Hermes-Desktop\`, local operator tools |
| WSL `Revelation` | `/home/revelation/factorygrid` | vLLM, LiteLLM, RuFlo, RuFloUI, OpenHands, Qdrant, Neo4j, worker containers |
| WSL `decima-intelligence-it` | `/home/decima` | Hermes dashboard/chat, Hermes CLI console, claude-code CLI console, research sidecar |

## Runtime URLs

### Revelation / FactoryGrid

| Service | Internal / Docker | Host / LAN | Current status |
| --- | --- | --- | --- |
| vLLM model API | `http://127.0.0.1:18000/v1` | `http://172.20.86.232:18000/v1` | running native WSL process |
| LiteLLM gateway | `http://litellm:4000/v1` | `http://172.20.86.232:4001/v1` | healthy container |
| Qdrant | `http://qdrant:6333` | `http://172.20.86.232:6333` | healthy container |
| Neo4j shadow graph | `bolt://neo4j:7687`, `http://neo4j:7474` | `127.0.0.1:7474`, `127.0.0.1:7687` | running, currently unhealthy |
| OpenHands | `http://openhands_engineer:3000` | `http://172.20.86.232:3001` | healthy container |
| RuFlo MCP | `http://factory_ruflo:3010` | `http://172.20.86.232:3011` | healthy container |
| RuFloUI API | `http://factory_rufloui:28580` | `http://172.20.86.232:28580` | healthy container |
| RuFloUI frontend | `http://factory_rufloui:28588` | `http://172.20.86.232:28589` | healthy container |

### Decima / Hermes

| Service | URL | Notes |
| --- | --- | --- |
| Hermes dashboard/chat/logs | `http://172.20.86.232:9119/` | Runs in WSL `decima-intelligence-it`, not in Revelation |
| Hermes CLI ttyd | `http://172.20.86.232:7681` | Browser console around `/home/decima/.local/bin/hermes` |
| claude-code ttyd | `http://172.20.86.232:7682` | Browser console around `/home/decima/.local/bin/claude-local` |
| agent-server / OpenHands sidecar | `http://172.20.86.232:8000` | Decima local helper process |

### Windows Host

| Component | Path / URL | Notes |
| --- | --- | --- |
| Hermes Desktop install | `D:\Hermes-Desktop\` | Windows desktop build and update wrapper |
| Hermes Desktop executable | `D:\Hermes-Desktop\hermes-agent\apps\desktop\release\win-unpacked\Hermes.exe` | Built from Hermes Agent v0.16.0 source |
| Hermes Desktop updater | `D:\Hermes-Desktop\update-hermes.ps1` | Reuses `HERMES_HOME=D:\Hermes-Desktop` |

## Stable Model

- vLLM model: `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ`
- LiteLLM ids: `qwen-coder-14b`, `qwen-coder-14b-anthropic`, `mode-a-research`, `local-qwen`
- Context: `32768`
- Parallel sequences: `4`
- Quantization: `awq_marlin`
- vLLM flags: `--enable-auto-tool-choice --tool-call-parser hermes`

`mode-a-research` is the default research/Claude/Hermes alias. Qwen3-Coder or other models must stay behind an explicit test launcher until `/v1/models`, warm-up inference, and dependent services pass.

## Workflow Matrix

| Stage | Principal Agent | Input | Required Artifact | Gate |
| --- | --- | --- | --- | --- |
| Intake | Queen | rough user goal | `workspace/spec-kit/intake/<run_id>_request.md` | scope and success criteria |
| Spec | Queen + Spec Kit | intake | `workspace/spec-kit/specs/<run_id>_spec.md` | operator approval before DEV |
| Research | Researcher | spec + constraints | `research_brief.md`, `source_manifest.json` | citations, fetch timestamps, hashes |
| Architecture | Architect | research + workspace map | `architecture_blueprint.json` | protected paths and allowed writes |
| Planning | Queen | spec + blueprint | task graph / run manifest | tasks map to artifacts |
| Implementation | Coder | approved blueprint | bounded diff | write allowlist |
| Verification | Tester | diff + commands | `validation_report.md` | fresh command output |
| Review | Reviewer | diff + validation | `review_log.json` | risk and regression review |
| Documentation | Documenter | review log | `handoff_summary.md`, Factory Brain page | durable, operator-readable truth |
| Memory | Documenter + memory path | accepted artifacts | Qdrant/Factory Brain records | provenance and conflict handling |

## Required Runtime Commands

Run from WSL `Revelation`:

```bash
cd /home/revelation/factorygrid
bin/factory-stack-health.sh
docker compose ps
curl -fsS http://127.0.0.1:18000/v1/models
curl -fsS -H 'Authorization: Bearer sk-mode-a-research' http://127.0.0.1:4001/v1/models
```

Run from WSL `decima-intelligence-it`:

```bash
~/start-hermes-dashboard.sh
curl -fsS http://127.0.0.1:9119/logs
env | grep -E 'OPENAI|ANTHROPIC|CLAUDE|LITELLM|VLLM|RUFLO|QDRANT'
```

Run from Windows PowerShell:

```powershell
Test-NetConnection 172.20.86.232 -Port 9119
powershell -ExecutionPolicy Bypass -File D:\Hermes-Desktop\update-hermes.ps1
```

## Safety Gates

- Protected file changes require explicit `infrastructure_run=true` in the architecture blueprint.
- OpenHands max iterations stay at 40 during UI/runtime prototyping.
- Factory correction cycles stay capped at 3.
- Long logs are saved as artifacts and summarized before entering model context.
- Docker socket access is privileged and must be visible in docs and UI.
- Every run must have a run id and artifacts under `workspace/.factory-snapshots/<run_id>/`.
- Security, cellular, trading, broker, and production-network tasks must stay in defensive/lab mode unless credentials, authorization, and test harnesses are explicitly present.

## Memory Contract

Qdrant records and Factory Brain pages must include:

- source path or URL
- summary
- exact excerpt or artifact path
- hash
- language or domain
- dependencies
- last verified timestamp
- run id
- supersedes/conflicts relation when replacing older facts

No memory record is accepted without provenance. Neo4j/Graphiti is a shadow graph until its health and write/read path are green.

## Brain-First Rule

Before research, architecture, implementation, review, or documentation, the responsible agent must search Factory Brain and include relevant prior decisions or explicitly state that no relevant memory exists.

## Live Validation Snapshot

Verified on 2026-06-06:

- Revelation Docker stack is running with healthy Qdrant, LiteLLM, RuFlo, RuFloUI, OpenHands, and Qwen worker containers.
- Neo4j is running but reports unhealthy, so graph memory remains shadow/non-authoritative.
- Native vLLM serves `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` on port `18000`.
- LiteLLM exposes `qwen-coder-14b`, `qwen-coder-14b-anthropic`, `mode-a-research`, and `local-qwen`.
- Decima Hermes dashboard is reachable on `http://172.20.86.232:9119/`.
- Decima shell exports local LiteLLM/vLLM/RuFlo/Qdrant routing for Hermes and claude-code.
