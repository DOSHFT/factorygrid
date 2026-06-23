# FactoryGrid Fabric Monitoring

Date: 2026-06-06

## Purpose

The Fabric page is the operator view for FactoryGrid runtime state. It should show production containers, task state, memory state, and service reachability without mixing old experimental memory containers into the active path.

## Data Sources

- Docker container inventory: `docker ps -a --format`, with fallback to the mounted Docker Engine socket at `/var/run/docker.sock`.
- Task state: RuFloUI task store.
- Memory state: explicit true-memory probes for Factory Brain, Qdrant recall, and Neo4j shadow graph.
- Runtime endpoints: `/api/system/factory-runtime`.
- GPU state: `nvidia-smi`.
- Fabric page snapshot: `/api/fabric/snapshot`.

`/api/monitoring/fabric` returns the full production report. `/api/fabric/snapshot` adapts the same live data into the node/link/count shape consumed by the existing Fabric page.

The RuFloUI container has the Docker socket mounted but does not require a `docker` binary. Fabric monitoring uses the Docker socket fallback when running in the live container. If Docker discovery is unavailable, Fabric omits the old `docker-unavailable` legacy marker instead of showing a false degraded memory row.

**Memory Evolution Push (2026-06) implemented in this tree**: Ruflo custom POST /api/workspace/push-memory-evolution (production handler inside workspaceRoutes(), full every-agent + mistakes-as-memories + sync + SOUL hardening + Ruflo memory record), green "Push Changes" button (WorkspacePanel, gated confirm, only next to Preview/Diff when file selected), api + handlePush, apply-memory-evolution.skill.md + research-collaboration-memory v0.2 (lesson action, evidence chains forward, non-negotiable growth via failure_learned_from). The push (triggered from http://192.168.178.20:28589/workspace or Hermes skill) activates MEMORY_EVOLUTION_2026-06 + updated CLAUDE for all agents (Queen, Hermeses on decima/Desktop, execution, Claude Code). See bin/ *-192.168.178.20.ps1 for clean post-push restarts. Future fabric snapshots should surface lesson counts / memory health nodes.

## Service Checks

`/api/system/factory-runtime` checks service endpoints that RuFloUI must directly depend on:

- vLLM model server: tries configured `VLLM_HOST`, then `127.0.0.1:18000`, then `localhost:18000`, then `host.docker.internal:18000`.
- LiteLLM gateway: tries local host mapping and Docker service name.
- OpenHands: tries local host mapping and Docker service name.
- Hermes Dashboard: tries configured `HERMES_DASHBOARD_URL`, then Decima/host bridge candidates such as `http://172.20.80.1:9119` and `http://host.docker.internal:9119`.
- RuFlo orchestrator: reported from Docker healthcheck status.

The Fabric page shows a **Degraded States** section. Every yellow or red node/link must be listed there with:

- the affected component or connection,
- the raw probe detail,
- a restart action when the target is a production Docker container,
- vLLM start, warm-up, reload, and RCA actions when the model endpoint is down or suspect,
- RCA output that includes an inference probe instead of only reporting that a PID exists.

The RuFlo orchestrator runtime line is green when the `factory_ruflo` production container is healthy. It should not show vague yellow `unknown` while Docker health is green.

## Operator Actions

Production Docker rows can be restarted from Fabric through `/api/fabric/restart`. The backend first tries `docker compose restart <service>` and falls back to the mounted Docker Engine socket when RuFloUI is running inside a container without a Docker CLI binary.

vLLM is a native WSL GPU process, not a Docker container. Fabric controls it through the host-control bridge:

- host-control service: `bin/factory-host-control.py`
- RuFloUI host-control candidates: configured `FACTORY_HOST_CONTROL_URL`, then `http://172.18.0.1:28601`, `http://host.docker.internal:28601`, `http://127.0.0.1:28601`, `http://localhost:28601`
- start script: `bin/start-factory-host-control.sh`
- vLLM launcher: `bin/restart-vllm-factory.sh`
- warm-up endpoint: `POST /vllm/warmup`
- RCA reports: `workspace/reports/vllm-rca/`

`bin/factory-start.sh` starts the host-control bridge as part of the normal stack startup and fails the startup health check if `/health` is unavailable. The bridge must run in the native WSL environment that owns the GPU vLLM virtualenv; Fabric then reaches it from Docker through the host-control candidate list above.

The Fabric vLLM readiness probe checks `/v1/models` through the configured `VLLM_HOST` and Docker gateway fallback `http://172.18.0.1:18000/v1/models`. If all candidates fail, the red Fabric line must show each failed URL so the operator can distinguish a dead model process from a container-to-host routing problem.

Fabric exposes three separate vLLM operator actions:

- **Start Model** starts the selected model if vLLM is stopped.
- **Warm Up Model** sends a real OpenAI-compatible chat completion request directly to `http://127.0.0.1:18000/v1/chat/completions`. This forces the selected model through an inference pass and writes GPU-before/GPU-after evidence to `workspace/reports/vllm-warmup/`.
- **Reload Model** restarts the native WSL vLLM process with the selected model.

The model dropdown is populated from `runtime/model-profiles/*.env` first. These profiles are the operator-approved launch contracts and must appear even when host-control is unavailable. Host-control and cached Hugging Face model directories under `~/.cache/huggingface/hub` are secondary discovery sources.

Every dropdown entry must display a safe launch preset before Fabric starts or reloads it. The preset controls `GPU_MEM`, `MAX_MODEL_LEN`, `MAX_NUM_SEQS`, `MAX_BATCHED_TOKENS`, `SWAP_SPACE_GB`, `QUANTIZATION`, and the allowed/blocked policy. Curated profile values override generic model-size heuristics. AWQ models use `awq_marlin`; non-AWQ models do not get forced AWQ quantization. Non-quantized 70B-class models and non-vLLM/external profiles are blocked on the local vLLM start path.

Changing or reloading the selected model/profile persists the model and safety preset to `runtime/vllm-model.env`, restarts native vLLM, then restarts model-call dependencies through Fabric: `factory_litellm`, `factory_ruflo`, `agent_qwen_code`, and `agent_openhands`.

Each successful or blocked model start/reload also creates a Hermes model-sync work order under `workspace/work-orders/`. Hermes runs on Decima and should continue using `http://172.20.86.232:4001/v1` with the stable LiteLLM alias `qwen-coder-14b`; the work order exists so a model switch forces verification of Hermes config, LiteLLM aliases, Decima env metadata, and the Fabric Hermes dashboard link.

Fabric lists Hermes as a support runtime node with:

- Dashboard: `http://192.168.178.20:9119`
- Console: `http://192.168.178.20:7681`
- model route: Hermes -> LiteLLM `4001` -> vLLM `factory-active`

The RCA action now also runs the same small inference probe. A PID, listening port, or `/v1/models` response is not enough to mark vLLM healthy; the useful health signal is whether the model can complete a request and whether GPU evidence is captured in the report.

Qdrant is not checked as a direct RuFloUI-to-Qdrant connection line. That edge caused false red Fabric lines when RuFloUI was served from WSL while Qdrant was Docker-scoped. Qdrant remains monitored as:

- the `factory_qdrant` production container,
- memory API stats,
- Factory Brain and Qdrant-backed memory behavior.

## True Memory Path

Fabric must show the current authoritative memory path as first-class memory nodes:

- `Factory Brain`: readable source of truth from `workspace/factory-brain/pages`, checked through `/api/memory/stats`.
- `Qdrant Recall`: production vector recall store, checked through `http://qdrant:6333/collections` from RuFloUI and exposed on LAN through port `6333`.
- `Neo4j Shadow Graph`: temporal graph memory shadow store for Graphiti-compatible episodes and repair edges, checked through `http://neo4j:7474`.

Graphiti is not authoritative yet. It remains the future activation path over Neo4j once local chat and embedding endpoints are fully configured. Until then, Factory Brain plus Qdrant is production memory and Neo4j is the checked shadow graph.

## Container Classification

- `production`: current FactoryGrid services such as RuFloUI, RuFlo, LiteLLM, Qdrant, Neo4j, OpenHands, and Qwen worker.
- `legacy`: stopped or old memory-related containers, including old experimental memory/gateway containers.
- `support`: discovered containers that are not production-authoritative.

Legacy and stopped containers are intentionally omitted from the Fabric graph. They are not production-authoritative and should not create yellow/orange degraded rows for the current stack.

## Windows Portproxy

If the public LAN page shows stale Fabric data, check Windows portproxy rules from elevated PowerShell:

```powershell
netsh interface portproxy show all
```

Remove stale FactoryGrid rules:

```powershell
foreach ($p in 28580,28588,28589,3001,3011,4001,6333,6334) {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$p
}
```

Then restart from WSL:

```bash
cd /mnt/d/UAT/factorygrid
./bin/factory-start.sh
```
