# FactoryGrid Fabric Monitoring

Last verified: 2026-06-06

## Purpose

The Fabric page is the operator view for FactoryGrid runtime state. It should show production containers, task state, memory state, GPU/model state, and service reachability without mixing old experimental memory containers into the active path.

Fabric must reflect the current runtime split:

- WSL `Revelation`: vLLM, LiteLLM, RuFlo, RuFloUI, Qdrant, Neo4j, OpenHands, Qwen worker.
- WSL `decima-intelligence-it`: Hermes dashboard/chat, Hermes CLI, claude-code CLI, agent-server.
- Windows host: `D:\Hermes-Desktop`, browser/operator access, LAN portproxy.

## Data Sources

- Docker container inventory: `docker ps -a --format`, with fallback to the mounted Docker Engine socket at `/var/run/docker.sock`.
- Task state: RuFloUI task store.
- Memory state: Factory Brain, Qdrant recall, and Neo4j shadow graph.
- Runtime endpoints: `/api/system/factory-runtime`.
- GPU state: `nvidia-smi`.
- Fabric page snapshot: `/api/fabric/snapshot`.
- Decima Hermes reachability: `http://172.20.86.232:9119/logs`.
- Windows Hermes Desktop status: filesystem checks under `D:\Hermes-Desktop` when inspected from the host.

`/api/monitoring/fabric` returns the full production report. `/api/fabric/snapshot` adapts the same live data into the node/link/count shape consumed by the Fabric page.

## Service Checks

`/api/system/factory-runtime` checks service endpoints that RuFloUI must directly depend on:

- vLLM model server: configured `VLLM_HOST`, `127.0.0.1:18000`, `localhost:18000`, `host.docker.internal:18000`.
- LiteLLM gateway: Docker service name and host mapping.
- OpenHands: Docker service name and host mapping.
- RuFlo orchestrator: Docker healthcheck status.
- Qdrant: production container and memory API behavior.
- Neo4j: container status and HTTP/Bolt health; currently running but unhealthy.

The Fabric page shows a **Degraded States** section. Every yellow or red node/link must list:

- affected component or connection,
- raw probe detail,
- restart action when target is a production Docker container,
- vLLM start/warm-up/reload/RCA actions when the model endpoint is down or suspect,
- RCA output with inference evidence, not only PID/port evidence.

The RuFlo orchestrator runtime line is green when `factory_ruflo` is healthy. It should not show vague yellow `unknown` while Docker health is green.

## Live Status Snapshot

Verified on 2026-06-06:

| Component | Status |
| --- | --- |
| `factory_qdrant` | healthy |
| `factory_litellm` | healthy |
| `factory_ruflo` | healthy |
| `factory_rufloui` | healthy |
| `agent_qwen_code` | healthy |
| `agent_openhands` | healthy |
| `factory_neo4j` | running but unhealthy |
| native vLLM | serves `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` on port `18000` |
| Decima Hermes | reachable on `http://172.20.86.232:9119/` |
| Windows Hermes Desktop | installed under `D:\Hermes-Desktop` |

## Operator Actions

Production Docker rows can be restarted from Fabric through `/api/fabric/restart`. The backend first tries `docker compose restart <service>` and falls back to the mounted Docker Engine socket when RuFloUI is running inside a container without a Docker CLI binary.

vLLM is a native WSL GPU process, not a Docker container. Fabric controls it through the host-control bridge:

- host-control service: `bin/factory-host-control.py`
- start script: `bin/start-factory-host-control.sh`
- vLLM launcher: `bin/restart-vllm-factory.sh`
- warm-up endpoint: `POST /vllm/warmup`
- RCA reports: `workspace/reports/vllm-rca/`

Fabric exposes three vLLM operator actions:

- **Start Model** starts the selected model if vLLM is stopped.
- **Warm Up Model** sends a real OpenAI-compatible chat completion request directly to vLLM and writes GPU-before/GPU-after evidence.
- **Reload Model** restarts native WSL vLLM with the selected model.

Changing or reloading the selected model persists the model and safety preset to `runtime/vllm-model.env`, restarts native vLLM, then restarts model-call dependencies: `factory_litellm`, `factory_ruflo`, `agent_qwen_code`, and `agent_openhands`.

## True Memory Path

Fabric must show current authoritative memory nodes:

- `Factory Brain`: readable source of truth from `workspace/factory-brain/pages`.
- `Qdrant Recall`: production vector recall store.
- `Neo4j Shadow Graph`: temporal graph candidate, currently degraded.

Graphiti is not authoritative yet. It remains the future activation path over Neo4j once local chat and embedding endpoints are fully configured and Neo4j health is green.

## Container Classification

- `production`: RuFloUI, RuFlo, LiteLLM, Qdrant, Neo4j, OpenHands, Qwen worker.
- `legacy`: stopped or old memory-related containers.
- `support`: discovered containers that are not production-authoritative.

Legacy and stopped containers are intentionally omitted from the Fabric graph. They are not production-authoritative and should not create degraded rows for the current stack.

## Windows Portproxy

Revelation LAN exposure should include FactoryGrid services only:

- `22`
- `28589`
- `28580`
- `3001`
- `3011`
- `4001`
- `6333`
- `18000`

Hermes is Decima-owned and must be shown separately:

- Hermes dashboard/chat/logs: `http://172.20.86.232:9119/`
- Hermes CLI ttyd: `http://172.20.86.232:7681`
- claude-code ttyd: `http://172.20.86.232:7682`
- agent-server helper: `http://172.20.86.232:8000`

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

Then restart from WSL `Revelation`:

```bash
cd /home/revelation/factorygrid
./bin/factory-start.sh
```
