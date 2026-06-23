# FactoryGrid Architecture

Last verified: 2026-06-23 on `revelation@BlackBeast`

FactoryGrid is a local-first software factory running inside the `revelation` WSL2 Ubuntu instance. The purpose is to turn written product ideas into researched implementation plans, executable tasks, generated code, and validation loops with minimal manual glue work.

The stack is deliberately split into five layers:

1. Single model backend: exactly one active vLLM server owns GPU inference.
2. Gateway routing: LiteLLM exposes the stable agent-facing OpenAI/Anthropic-compatible API.
3. Factory orchestration: RuFlo decomposes written intent into agent work.
4. Engineer execution: OpenHands runs coding tasks against the workspace.
5. Memory and retrieval: Qdrant stores vector memory for recall and context reuse.

## Model Topology Contract

FactoryGrid must not run separate model servers per VM, WSL distro, agent, or task type. There is one model source of truth:

- vLLM is the only heavy model serving backend.
- LiteLLM is the only endpoint agents and tools should call directly.
- Model profiles in `runtime/model-profiles/*.env` describe switchable vLLM run contracts.
- `runtime/vllm-model.env` is the active vLLM runtime file copied from the selected profile.
- vLLM serves the selected backend model as stable id `factory-active`.
- `litellm_config.yaml` maps stable aliases such as `qwen-coder-14b` to `openai/factory-active` on the active vLLM endpoint.
- Hermes runs on the Decima WSL distro, but it is not a model server. Hermes must call the Revelation LiteLLM gateway at `http://172.20.86.232:4001/v1` with the stable alias `qwen-coder-14b`.
- Red-team and blue-team models are profile choices behind the same vLLM/LiteLLM harness, not separate Ollama, Decima, Revelation, or per-agent daemons.

Allowed model endpoints:

| Caller | Endpoint | Purpose |
| --- | --- | --- |
| Agents, RuFlo, OpenHands, Hermes, Claude wrappers | `http://litellm:4000/v1` inside Docker or `http://127.0.0.1:4001/v1` from WSL/host | Stable LiteLLM gateway |
| LiteLLM container | `http://host.docker.internal:18000/v1` | Active vLLM backend |
| Operator diagnostics only | `http://127.0.0.1:18000/v1/models` | Verify the vLLM backend |

Forbidden model topology:

- no Ollama runtime for FactoryGrid agents,
- no model server hidden in Decima while Revelation routes somewhere else,
- no direct agent calls to vLLM except diagnostic probes,
- no automatic vLLM start during stack boot.

Model switching flow:

```bash
cd /home/revelation/factorygrid
bin/factory-model-stop.sh all
bin/factory-model-start.sh qwen-coder-awq-daily
docker compose restart factory_litellm factory_ruflo agent_qwen_code agent_openhands
bin/factory-model-status.sh
```

The Fabric page uses the same profile contract. Its Local vLLM dropdown must list every `runtime/model-profiles/*.env` profile first, then any cached host-control/Hugging Face candidates. Each entry must display its safe launch settings before start/reload:

- `GPU_MEM`
- `MAX_MODEL_LEN`
- `MAX_NUM_SEQS`
- `MAX_BATCHED_TOKENS`
- `SWAP_SPACE_GB`
- `QUANTIZATION`
- policy/reason

When Fabric starts or reloads a model/profile, it must also create a Hermes model-sync work order under `workspace/work-orders/`. Hermes normally does not change its model id because it talks to LiteLLM aliases, but the work order forces verification that:

- Decima Hermes still uses `base_url: http://172.20.86.232:4001/v1`;
- Hermes default model is still the stable alias `qwen-coder-14b`;
- LiteLLM still maps Hermes aliases to `openai/factory-active`;
- Decima environment metadata such as `FACTORY_VLLM_MODEL`/`VLLM_MODEL` is updated if it is shown to operators;
- the Hermes dashboard still opens from Fabric.

For containerized vLLM experiments, keep the same contract: one OpenAI-compatible backend exposed on the configured vLLM URL, one LiteLLM gateway in front of it, and no second backend in another WSL distro.

## Live Topology

```text
Windows 11 BlackBeast
  |
  +-- WSL2 distro: decima-intelligence-it
  |     |
  |     +-- Hermes dashboard / CLI surface
  |           calls Revelation LiteLLM 4001; does not serve models
  |
  +-- WSL2 distro: revelation
        |
        +-- one active vLLM backend on port 18000
        |     selected by runtime/model-profiles/*.env
        |
        +-- Docker network: factorygrid_factory_net
              |
              +-- factory_litellm   :4000 / host :4001  only agent-facing model gateway
              +-- factory_ruflo     RuFlo orchestration queen
              +-- agent_openhands   :3000  autonomous engineer UI/runtime
              +-- agent_qwen_code   detached Node worker shell
              +-- factory_qdrant    :6333/:6334 vector memory
```

## Endpoint And UI Inventory

Use this section as the source of truth for browser URLs, APIs, and health probes. Agents should call LiteLLM for model work; vLLM is listed for diagnostics and operator model-switch verification only.

### Operator Web UIs

| Surface | LAN URL | Local host URL | Owner | Notes |
| --- | --- | --- | --- | --- |
| RuFloUI Factory | `http://192.168.178.20:28589/factory` | `http://127.0.0.1:28589/factory` | Revelation Docker | Main intake and factory control surface |
| RuFloUI Dashboard | `http://192.168.178.20:28589/` | `http://127.0.0.1:28589/` | Revelation Docker | General UI shell |
| RuFloUI Fabric Monitor | `http://192.168.178.20:28589/monitoring/fabric` | `http://127.0.0.1:28589/monitoring/fabric` | Revelation Docker | Stack, model, and runtime health |
| RuFloUI Agents | `http://192.168.178.20:28589/agents` | `http://127.0.0.1:28589/agents` | Revelation Docker | Agent roster/status |
| RuFloUI Tasks | `http://192.168.178.20:28589/tasks` | `http://127.0.0.1:28589/tasks` | Revelation Docker | Task queue/status |
| RuFloUI Workspace | `http://192.168.178.20:28589/workspace` | `http://127.0.0.1:28589/workspace` | Revelation Docker | Repo/file browser |
| RuFloUI Logs | `http://192.168.178.20:28589/logs` | `http://127.0.0.1:28589/logs` | Revelation Docker | Runtime logs |
| OpenHands | `http://192.168.178.20:3001` | `http://127.0.0.1:3001` | Revelation Docker | Autonomous engineer UI/runtime |
| Qdrant Dashboard | `http://192.168.178.20:6333/dashboard` | `http://127.0.0.1:6333/dashboard` | Revelation Docker | Vector memory dashboard |
| Neo4j Browser | `http://192.168.178.20:7474` | `http://127.0.0.1:7474` | Revelation Docker | Shadow graph, not authoritative until healthy |
| Hermes Dashboard | `http://192.168.178.20:9119` | Decima local `http://127.0.0.1:9119` | Decima WSL | Hermes chat/dashboard, separate from model serving |
| Hermes ttyd Console | `http://192.168.178.20:7681` | Decima local `http://127.0.0.1:7681` | Decima WSL | Browser terminal for Hermes CLI |
| Claude ttyd Console | `http://192.168.178.20:7682` | Decima local `http://127.0.0.1:7682` | Decima WSL | Browser terminal for `claude-local` |

### APIs And Health Probes

| Service | LAN URL | Local host URL | Docker/internal URL | Purpose |
| --- | --- | --- | --- | --- |
| LiteLLM models | `http://192.168.178.20:4001/v1/models` | `http://127.0.0.1:4001/v1/models` | `http://litellm:4000/v1/models` | Agent-facing model gateway |
| LiteLLM chat completions | `http://192.168.178.20:4001/v1/chat/completions` | `http://127.0.0.1:4001/v1/chat/completions` | `http://litellm:4000/v1/chat/completions` | Chat/completion API |
| vLLM models | `http://192.168.178.20:18000/v1/models` | `http://127.0.0.1:18000/v1/models` | LiteLLM reaches `http://host.docker.internal:18000/v1/models` | Active backend diagnostics only |
| vLLM chat completions | `http://192.168.178.20:18000/v1/chat/completions` | `http://127.0.0.1:18000/v1/chat/completions` | LiteLLM reaches `http://host.docker.internal:18000/v1/chat/completions` | Backend warm-up/RCA only |
| Hermes Dashboard | `http://192.168.178.20:9119` | Decima local `http://127.0.0.1:9119` | n/a | Hermes UI reachability, surfaced on Fabric |
| RuFlo MCP health | `http://192.168.178.20:3011/health` | `http://127.0.0.1:3011/health` | `http://factory_ruflo:3010/health` | RuFlo orchestration API health |
| RuFloUI API info | `http://192.168.178.20:28580/api/system/info` | `http://127.0.0.1:28580/api/system/info` | `http://factory_rufloui:28580/api/system/info` | UI backend health |
| RuFloUI guide | `http://192.168.178.20:28580/api/factory/guide` | `http://127.0.0.1:28580/api/factory/guide` | `http://factory_rufloui:28580/api/factory/guide` | Factory guide payload |
| Qdrant collections | `http://192.168.178.20:6333/collections` | `http://127.0.0.1:6333/collections` | `http://qdrant:6333/collections` | Vector store health |
| OpenHands settings | `http://192.168.178.20:3001/api/settings` | `http://127.0.0.1:3001/api/settings` | `http://openhands_engineer:3000/api/settings` | OpenHands runtime/model config |
| Neo4j Bolt | `bolt://192.168.178.20:7687` | `bolt://127.0.0.1:7687` | `bolt://neo4j:7687` | Graph database driver endpoint |

### Access Rules

- Use LAN URLs from other machines.
- Use local host URLs from BlackBeast or the owning WSL distro only.
- Use Docker/internal URLs only from containers on the FactoryGrid Docker network.
- Use LiteLLM for all agent model calls.
- Use vLLM URLs only for diagnostics, warm-up, RCA, and model-switch verification.
- Do not add Ollama or second vLLM endpoints to this inventory unless the architecture is explicitly changed.

Primary directory:

```bash
/home/revelation/factorygrid
```

## Components

### vLLM Native Inference

Role: the single GPU model server for FactoryGrid.

Endpoint:

```text
http://localhost:18000/v1
```

Model:

```text
Qwen/Qwen2.5-Coder-14B-Instruct-AWQ
```

Relevant source:

- https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct
- https://arxiv.org/abs/2409.12186
- https://docs.vllm.ai/

Launcher:

```bash
/home/revelation/factorygrid/bin/start-vllm-factory.sh
```

Default daily profile settings:

```bash
GPU_MEM=0.50
MAX_MODEL_LEN=8192
MAX_NUM_SEQS=1
MAX_BATCHED_TOKENS=8192
SWAP_SPACE_GB=4
--enable-prefix-caching
--disable-log-requests
--enforce-eager
```

Why these settings:

- `8192` context is the safe daily profile while the context-engineering layer carries large artifacts through exact packs and retrieval.
- `max-num-seqs=1` prevents multi-agent bursts from overcommitting KV cache.
- `gpu-memory-utilization=0.50` leaves VRAM headroom for the Windows desktop, browser, Docker, CUDA overhead, and WSL noise.
- Prefix caching helps repeated context-engineering prompts where the same spec/context prefix is reused.
- Eager mode avoids CUDA graph capture reserving extra memory on the RTX 4090.
- Temp vars are forced to Linux paths:

```bash
TMPDIR=/tmp
TEMP=/tmp
TMP=/tmp
```

This avoids the known failure where vLLM/ZeroMQ tries to create IPC sockets under a Windows temp mount.

Commands:

```bash
cd /home/revelation/factorygrid
./bin/factory-model-start.sh qwen-coder-awq-daily
./bin/factory-model-stop.sh all
tail -f logs/vllm-factory.log
curl http://localhost:18000/v1/models
```

### LiteLLM Gateway

Role: normalize all local model access behind one OpenAI/Anthropic-compatible API. Agents call LiteLLM, not vLLM directly.

Endpoint:

```text
http://localhost:4000/v1
```

Config:

```bash
/home/revelation/factorygrid/litellm_config.yaml
```

Current mapping:

```yaml
model_list:
  - model_name: qwen-coder-14b
    litellm_params:
      model: openai/factory-active
      api_base: http://host.docker.internal:18000/v1
      api_key: "not-needed"
```

Relevant source:

- https://docs.litellm.ai/

Why LiteLLM exists:

- OpenHands, RuFlo, scripts, and future tools can all call `qwen-coder-14b`.
- vLLM can be swapped or upgraded without rewriting every agent config.
- Failures are visible at the gateway boundary.
- Profile switches remain centralized instead of creating model servers across multiple WSL distros.

Verification:

```bash
curl http://localhost:4000/v1/models
```

Chat test:

```bash
curl -s http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer factory-secret-key' \
  -d '{
    "model":"qwen-coder-14b",
    "messages":[{"role":"user","content":"Reply exactly OK."}],
    "max_tokens":8,
    "temperature":0
  }'
```

### RuFlo Orchestrator

Role: factory queen. RuFlo owns decomposition of written ideas into structured agent work.

Config:

```bash
/home/revelation/factorygrid/ruflo_project/ruflo.config.js
```

Current routing:

```js
router: {
  api_base: "http://litellm:4000/v1",
  default_model: "qwen-coder-14b",
  reasoning_model: "qwen-coder-14b"
}
```

Current agents:

- `Queen`: decomposes rough written intent into atomic tasks.
- `Architect`: turns product ideas into interface architecture and implementation boundaries.
- `Coder`: executes concrete changes.

RuFlo is the component that consumes the context-engineering input: product visions, requirements, constraints, repo notes, acceptance criteria, and human decisions. Its job is not just chat. Its job is structured decomposition and coordination.

Commands:

```bash
cd /home/revelation/factorygrid
docker logs -f factory_ruflo
docker exec -it factory_ruflo sh
```

Inside the container:

```bash
ruflo status
ruflo swarm status
```

Current operational note:

`ruflo start` runs foreground health checks and can exit cleanly. The local image installs the pinned `RUFLO_VERSION` during image build, then the entrypoint starts the daemon and MCP service without pulling `ruflo@latest` at runtime:

```yaml
build:
  args:
    RUFLO_VERSION: ${RUFLO_VERSION:-3.7.0-alpha.44}
```

### OpenHands Engineer

Role: autonomous engineer runtime and browser UI.

UI:

```text
http://localhost:3000
```

OpenHands receives tasks from the operator or orchestration layer, calls LiteLLM, and executes code in the mounted workspace.

Relevant source:

- https://github.com/All-Hands-AI/OpenHands

Persistent settings:

```bash
/home/revelation/factorygrid/openhands_state/settings.json
```

Important settings:

```json
{
  "llm_model": "openai/qwen-coder-14b",
  "llm_base_url": "http://litellm:4000/v1",
  "llm_api_key": "factory-secret-key",
  "agent": "CodeActAgent",
  "max_iterations": 100
}
```

Workspace mount:

```text
/home/revelation/factorygrid/workspace -> /opt/workspace_base
```

Commands:

```bash
docker logs -f agent_openhands
curl http://localhost:3000/api/settings
```

### Qdrant Memory

Role: vector database for semantic memory, task recall, and future context reuse.

Endpoint:

```text
http://localhost:6333
```

Storage:

```bash
/home/revelation/factorygrid/qdrant_storage
```

Relevant source:

- https://qdrant.tech/documentation/

Qdrant is where reusable memory should land: prior product specs, implementation patterns, known decisions, failures, and validation summaries. RuFlo is configured to use it:

```js
memory: {
  provider: "qdrant",
  url: "http://factory_qdrant:6333"
}
```

## Context-Engineering Flow

The intended input is written context, not tiny prompts.

Examples:

- product idea
- constraints
- existing repo boundaries
- desired user workflow
- non-goals
- acceptance criteria
- prior notes and decisions
- validation requirements

Flow:

```text
Written idea/spec
  -> RuFlo Queen decomposes intent
  -> Architect role creates design boundaries
  -> Qdrant recalls prior context/patterns
  -> LiteLLM routes model calls
  -> vLLM runs Qwen coder model locally
  -> OpenHands executes code changes
  -> logs/status/probe scripts validate outcome
```

## Research and Design Responsibility

Research responsibility should be split:

- RuFlo Queen: asks what needs to be researched and breaks it into tasks.
- Architect agent: converts findings into architecture, boundaries, and interfaces.
- OpenHands: performs implementation and local verification.
- Human operator: approves major direction changes, model swaps, and destructive actions.

For latest external information, agents should use web/search tools where available, then persist findings into written artifacts. The system should not rely on model memory for current facts such as library versions, APIs, benchmarks, or security guidance.

## Checks and Balances

Implemented checks:

- LiteLLM is a single gateway, so model routing can be inspected in one file.
- vLLM is launched by explicit scripts with known VRAM/context settings.
- OpenHands settings are persisted instead of relying on transient environment variables.
- `factory-status.sh` checks sockets, GPU, RAM, Docker containers, and endpoints.
- PowerShell probe logs before/after prompt latency, RAM, swap, GPU VRAM, Docker state, response, and errors.
- RuFlo and OpenHands run in containers with isolated mounts.
- Qdrant persists vector state under `qdrant_storage`.

Commands:

```bash
cd /home/revelation/factorygrid
./bin/factory-status.sh
docker compose ps
docker logs --tail=100 factory_litellm
docker logs --tail=100 factory_ruflo
docker logs --tail=100 agent_openhands
tail -100 logs/vllm-factory.log
```

Windows-side probe:

```powershell
cd D:\Dev\Projects\_revelation-stack
.\scripts\revelation-llm-probe.ps1 `
  -Distro revelation `
  -BaseUrl "http://localhost:4000" `
  -Model "qwen-coder-14b" `
  -Prompt "Reply exactly OK." `
  -Runs 3
```

## Model Assessment

Current production model:

```text
Qwen/Qwen2.5-Coder-14B-Instruct-AWQ
```

Why it is the current best stable choice for this machine:

- It is already installed and verified under vLLM.
- It supports the required 32k context window.
- AWQ quantization fits a 24GB RTX 4090 with usable KV cache.
- It is code-specialized, not a generic chat model.
- It returns through LiteLLM and OpenHands successfully.
- It leaves enough VRAM headroom after tuning for stable local operation.

Known limitation:

- It is not the newest coding model family available in 2026.

Best next candidate to evaluate:

```text
Qwen/Qwen3-Coder-30B-A3B-Instruct
```

Relevant sources:

- https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct
- https://github.com/QwenLM/Qwen3-Coder

Why it is a candidate:

- It is newer.
- It is explicitly aimed at agentic coding workflows.
- It is a mixture-of-experts model with fewer active parameters than total parameters, making it attractive for local coding agents.

Why it is not the current production default:

- It is not yet installed and verified in this stack.
- Quantized variants need a separate benchmark pass.
- The 4090 memory envelope must be retuned before trusting it for autonomous factory work.
- Stability matters more than headline benchmark score for long-running software-factory tasks.

Model policy:

```text
Use Qwen2.5-Coder-14B-AWQ as stable production.
Evaluate Qwen3-Coder-30B-A3B as the next upgrade candidate.
Promote only after it passes latency, VRAM, context, code quality, and OpenHands/RuFlo integration tests.
```

## Startup and Restart

After a full WSL restart:

```bash
wsl -d revelation
cd /home/revelation/factorygrid
./bin/restart-vllm-factory.sh
docker compose up -d
./bin/factory-status.sh
```

Stop:

```bash
cd /home/revelation/factorygrid
docker compose down
./bin/stop-vllm-factory.sh
```

Restart only vLLM:

```bash
cd /home/revelation/factorygrid
./bin/restart-vllm-factory.sh
```

Restart containers:

```bash
cd /home/revelation/factorygrid
docker compose up -d --force-recreate
```

## WSL Memory Settings

Windows file:

```text
C:\Users\Setup User\.wslconfig
```

Configured target:

```ini
[wsl2]
memory=48GB
swap=24GB
processors=28
localhostForwarding=true

[experimental]
autoMemoryReclaim=gradual
sparseVhd=true
```

This requires:

```powershell
wsl --shutdown
```

Then start `revelation` again and restart FactoryGrid.

## Acceptance Checks

The stack is healthy when:

```bash
./bin/factory-status.sh
```

shows:

- optional listener on `18000` for the single active vLLM backend when a model profile is started
- listener on `4000` inside Docker or `4001` from host/WSL for LiteLLM
- listener on `3000` inside Docker or `3001` from host/WSL for OpenHands
- Qdrant on `6333/6334`
- all five containers running
- LiteLLM `/v1/models` returns `qwen-coder-14b`
- OpenHands `/api/settings` returns model `openai/qwen-coder-14b`

Run a completion check:

```bash
curl -s http://localhost:4001/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer factory-secret-key' \
  -d '{"model":"qwen-coder-14b","messages":[{"role":"user","content":"Reply exactly OK."}],"max_tokens":8,"temperature":0}'
```

Expected:

```text
OK
```

## Immediate Roadmap

1. Add a durable research artifact format for RuFlo outputs.
2. Store accepted specs, implementation plans, and validation summaries into Qdrant.
3. Add a model evaluation script comparing Qwen2.5-Coder-14B-AWQ against Qwen3-Coder-30B-A3B quantized candidates.
4. Add a factory run contract: idea -> research -> design -> plan -> tasks -> implementation -> validation -> report.
5. Add guardrails for destructive operations: repo boundaries, logging, and final validation reports.


## Factory Brain v0

Factory Brain is the durable operational memory layer for the software factory. It adapts the GBrain methodology without making GBrain itself a hard runtime dependency yet.

Core contract:

- `Compiled Truth`: the current best understanding of a run, component, agent, decision, source, or reusable skill.
- `Timeline`: append-only evidence and event history below the separator.
- `Entities`: typed names such as projects, tools, repos, agents, models, services, and decisions.
- `Brain-first lookup`: Queen, Researcher, Architect, Reviewer, and Documenter must query memory before planning or changing work.
- `Skillify`: repeated fixes and recurring workflows become tested skills or deterministic scripts instead of prompt folklore.

Storage:

```text
/home/revelation/factorygrid/workspace/factory-brain/pages/
  runs/
  decisions/
  components/
  skills/
  agents/
  sources/
```

API/UI:

```text
http://localhost:28588/factory
GET  /api/factory/guide
POST /api/factory/intake
GET  /api/factory/brain/search?q=<query>
```

Factory Brain complements Qdrant. Qdrant is the vector recall substrate. Factory Brain is the human-readable source of truth and evidence timeline.

## Spec Kit Workflow

Spec Kit is implemented as the formal artifact pipeline for context engineering. The current implementation uses the Spec Kit method and directory contract locally; a pinned upstream `github/spec-kit` CLI adapter can be evaluated later after the workflow proves useful.

Artifact root:

```text
/home/revelation/factorygrid/workspace/spec-kit/
  intake/
  specs/
  plans/
  tasks/
  checklists/
```

The operator starts at:

```text
http://localhost:28588/factory
```

The Factory UI writes:

- `workspace/spec-kit/intake/<run_id>_request.md`
- `workspace/spec-kit/specs/<run_id>_spec.md`
- `workspace/spec-kit/checklists/<run_id>_approval.md`
- `workspace/factory-brain/pages/runs/<run_id>.md`

Spec Kit owns the context-engineering shape. RuFlo/Queen owns orchestration. OpenHands owns execution after the relevant gate is approved.

## Self-Evolving Memory Direction

FactoryGrid currently uses Factory Brain markdown as readable truth and Qdrant as recall. The next architecture step is SAGE-inspired graph memory: typed entities, typed edges, evidence-chain retrieval, and reader feedback that creates memory repair tasks. Until a true embedding or graph-memory provider is wired in, Qdrant vectors are treated as recall hints rather than authoritative semantic memory.

## Product Packaging Boundary

FactoryGrid orchestrates products; it does not absorb product binaries. Product roots must be portable as directory/container units with their own `bin/`, `config/`, `docs/`, `protocols/`, and `runtime/` trees. Factory-level hooks and agents may call product-local scripts, but product-local scripts should not be placed under factory-global `bin/`.
