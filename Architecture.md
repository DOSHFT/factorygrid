# FactoryGrid Architecture

Last verified: 2026-05-17 on `revelation@BlackBeast`

FactoryGrid is a local-first software factory running inside the `revelation` WSL2 Ubuntu instance. The purpose is to turn written product ideas into researched implementation plans, executable tasks, generated code, and validation loops with minimal manual glue work.

The stack is deliberately split into five layers:

1. Native GPU inference: vLLM serves the local coding model.
2. Gateway routing: LiteLLM exposes a stable OpenAI-compatible API.
3. Factory orchestration: RuFlo decomposes written intent into agent work.
4. Engineer execution: OpenHands runs coding tasks against the workspace.
5. Memory and retrieval: Factory Brain stores readable truth, Qdrant stores production recall, and Neo4j stores temporal graph memory in shadow mode.

## Live Topology

```text
Windows 11 BlackBeast
  |
  +-- WSL2 distro: revelation
        |
        +-- native vLLM on port 8000
        |     model: Qwen/Qwen2.5-Coder-14B-Instruct-AWQ
        |
        +-- Docker network: factorygrid_factory_net
              |
              +-- factory_litellm   :4000  OpenAI-compatible gateway
              +-- factory_ruflo     RuFlo orchestration queen
              +-- agent_openhands   :3000  autonomous engineer UI/runtime
              +-- agent_qwen_code   detached Node worker shell
              +-- factory_qdrant    :6333/:6334 vector memory
              +-- factory_neo4j     :7474/:7687 temporal graph memory shadow
```

Primary directory:

```bash
/home/revelation/factorygrid
```

## Components

### vLLM Native Inference

Role: local GPU model server.

Endpoint:

```text
http://localhost:8000/v1
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

Current critical settings:

```bash
GPU_MEM=0.86
MAX_MODEL_LEN=32768
MAX_NUM_SEQS=2
MAX_BATCHED_TOKENS=32768
SWAP_SPACE_GB=4
--enable-prefix-caching
--disable-log-requests
```

Why these settings:

- `32768` context keeps long written specs, plans, logs, and architecture notes in-window.
- `max-num-seqs=2` prevents multi-agent bursts from overcommitting KV cache.
- `gpu-memory-utilization=0.86` leaves VRAM headroom for CUDA overhead and WSL noise.
- Prefix caching helps repeated context-engineering prompts where the same spec/context prefix is reused.
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
./bin/restart-vllm-factory.sh
./bin/stop-vllm-factory.sh
tail -f logs/vllm-factory.log
curl http://localhost:8000/v1/models
```

### LiteLLM Gateway

Role: normalize all local model access behind one OpenAI-compatible API.

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
      model: openai/Qwen/Qwen2.5-Coder-14B-Instruct-AWQ
      api_base: http://host.docker.internal:8000/v1
      api_key: "not-needed"
```

Relevant source:

- https://docs.litellm.ai/

Why LiteLLM exists:

- OpenHands, RuFlo, scripts, and future tools can all call `qwen-coder-14b`.
- vLLM can be swapped or upgraded without rewriting every agent config.
- Failures are visible at the gateway boundary.

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
npx ruflo@latest status
npx ruflo@latest swarm status
```

Current operational note:

`ruflo start` runs foreground health checks and can exit cleanly. The container command keeps the container alive after startup:

```yaml
command: sh -c "npm install -g ruflo@latest && npx ruflo@latest start; tail -f /dev/null"
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

- listener on `8000` for vLLM
- listener on `4000` for LiteLLM
- listener on `3000` for OpenHands
- Qdrant on `6333/6334`
- all five containers running
- LiteLLM `/v1/models` returns `qwen-coder-14b`
- OpenHands `/api/settings` returns model `openai/qwen-coder-14b`

Run a completion check:

```bash
curl -s http://localhost:4000/v1/chat/completions \
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

## Adversarial Technology Selection

Complex work now requires an adversarial technology-choice loop before DEV. The Queen routes proposals through Technology Strategist, GitHub Risk Scout, Architect, Performance Engineer, Tester, and Reviewer. For FIX work, the baseline comparison is Java Artio/Aeron/Agrona versus C++ FIX8, with QuickFIX/J as a lower-performance fallback. The gate is `server/hooks/gate_technology_choice.py`.

## Product Packaging Boundary

FactoryGrid orchestrates products; it does not absorb product binaries. A product such as FIXReaper must be portable as a directory/container unit with its own `bin/`, `config/`, `docs/`, `protocols/`, and `runtime/` tree. Factory-level hooks and agents may call product-local scripts, but product-local scripts should not be placed under factory-global `bin/`.
