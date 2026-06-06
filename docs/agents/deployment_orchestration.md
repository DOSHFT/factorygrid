# Deployment Orchestration Matrix

Last verified: 2026-06-06

## Runtime Planes

```text
Windows host BlackBeast
  -> browser/operator, Git, D:\Hermes-Desktop, portproxy

WSL Revelation
  -> vLLM, LiteLLM, RuFlo, RuFloUI, Qdrant, Neo4j, OpenHands, Qwen worker

WSL decima-intelligence-it
  -> Hermes dashboard/chat, Hermes CLI, claude-code CLI, ttyd consoles
```

Hermes dashboard is Decima-owned at `http://172.20.86.232:9119/`. RuFlo and the factory containers are Revelation-owned.

## Factory Run Flow

```text
[User Input Request]
        |
        v
[Queen] -> task_manifest / run id
        |
        v
[Researcher] -> research_brief.md + source_manifest.json
        |
        v
[Architect] -> architecture_blueprint.json
        |
        v
[Gate 1] architecture + snapshot + path bounds
        |
        v
[Coder] -> bounded diff
        |
        v
[Gate 2] diff scope + protected path check
        |
        v
[Tester] -> validation_report.md
        |
        v
[Gate 3] empirical test evidence
        |
        v
[Reviewer] -> review_log.json
        |
        v
[Gate 4] review pass + risk threshold
        |
        v
[Documenter] -> handoff_summary.md + Factory Brain memory prep
        |
        v
[Export Coverage Gate] required for UAT/PROD/runtime contract updates
```

## Live RuFlo Configuration

The live RuFlo contract is `ruflo_project/ruflo.config.js`:

- topology: `hierarchical`
- max agents: `11`
- context cap: `32768`
- router API base: `OPENAI_API_BASE` or `http://litellm:4000/v1`
- default model: `qwen-coder-14b`
- reasoning model: `qwen-coder-14b`
- memory provider: Qdrant

Agent contracts live in:

```text
/home/revelation/factorygrid/server/agents/<agent>/
```

Hook gates live in:

```text
/home/revelation/factorygrid/server/hooks/
```

RuFlo MCP launch env lives in:

```text
/home/revelation/factorygrid/ruflo_project/.mcp.json
```

It pins local routing for OpenAI-compatible clients, Anthropic-compatible clients, vLLM, Qdrant, and FactoryGrid paths.

## Live Agent Roster

| Agent | Contract Path | Deployment Role |
| --- | --- | --- |
| Queen | `server/agents/queen` | orchestrator, state machine, gate owner |
| Architect | `server/agents/architect` | system design and write-path boundaries |
| Researcher | `server/agents/researcher` | current-source research and provenance |
| Coder | `server/agents/coder` | bounded implementation |
| Tester | `server/agents/tester` | command validation |
| Reviewer | `server/agents/reviewer` | risk, diff, safety review |
| Documenter | `server/agents/documenter` | handoff and durable memory |
| Technology-Strategist | `server/agents/technology-strategist` | adversarial stack selection |
| GitHub-Risk-Scout | `server/agents/github-risk-scout` | upstream failure intelligence |
| Performance-Engineer | `server/agents/performance-engineer` | latency/throughput validation |
| Blue-Team-CELL | `server/agents/blue-team-cell` | lab-only defensive cellular security research |

## Activation Paths

### Revelation

```bash
cd /home/revelation/factorygrid
docker compose up -d
bin/factory-stack-health.sh
```

Systemd user units enabled on 2026-06-06:

- `factory-vllm.service`
- `factory-stack.service`

### Decima

```bash
~/start-hermes-dashboard.sh
curl -fsS http://127.0.0.1:9119/logs
```

Decima exports:

- `OPENAI_BASE_URL=http://172.20.80.1:4001/v1`
- `ANTHROPIC_BASE_URL=http://172.20.80.1:4001`
- `CLAUDE_CODE_MODEL=mode-a-research`
- `VLLM_BASE_URL=http://172.20.80.1:18000/v1`
- `RUFLO_MCP_URL=http://172.20.80.1:3011`

### Windows Host

```powershell
powershell -ExecutionPolicy Bypass -File D:\Hermes-Desktop\update-hermes.ps1
```

Windows Hermes Desktop must keep `HERMES_HOME=D:\Hermes-Desktop` for update persistence.
