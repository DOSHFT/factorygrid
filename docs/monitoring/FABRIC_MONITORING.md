# FactoryGrid Fabric Monitoring

Date: 2026-05-27

## Purpose

The Fabric page is the operator view for FactoryGrid runtime state. It should show production containers, task state, memory state, and service reachability without mixing old experimental memory containers into the active path.

## Data Sources

- Docker container inventory: `docker ps -a --format`, with fallback to the mounted Docker Engine socket at `/var/run/docker.sock`.
- Task state: RuFloUI task store.
- Memory state: Factory Brain entries plus memory API stats.
- Runtime endpoints: `/api/system/factory-runtime`.
- GPU state: `nvidia-smi`.
- Fabric page snapshot: `/api/fabric/snapshot`.

`/api/monitoring/fabric` returns the full production report. `/api/fabric/snapshot` adapts the same live data into the node/link/count shape consumed by the existing Fabric page.

The RuFloUI container currently has the Docker socket mounted but does not include a `docker` binary. Fabric monitoring therefore must use the Docker socket fallback when running in the live container; otherwise the page collapses to `docker-unavailable`.

## Service Checks

`/api/system/factory-runtime` checks service endpoints that RuFloUI must directly depend on:

- vLLM model server: tries configured `VLLM_HOST`, then `127.0.0.1:8000`, then `localhost:8000`, then `host.docker.internal:8000`.
- LiteLLM gateway: tries local host mapping and Docker service name.
- OpenHands: tries local host mapping and Docker service name.
- RuFlo orchestrator: reported from Docker healthcheck status.

The Fabric page now also shows a **Degraded States** section. Every yellow or red node/link must be listed there with:

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
- default URL from RuFloUI: `http://host.docker.internal:28601`
- start script: `bin/start-factory-host-control.sh`
- vLLM launcher: `bin/restart-vllm-factory.sh`
- warm-up endpoint: `POST /vllm/warmup`
- RCA reports: `workspace/reports/vllm-rca/`

Fabric exposes three separate vLLM operator actions:

- **Start Model** starts the selected model if vLLM is stopped.
- **Warm Up Model** sends a real OpenAI-compatible chat completion request directly to `http://127.0.0.1:8000/v1/chat/completions`. This forces the selected model through an inference pass and writes GPU-before/GPU-after evidence to `workspace/reports/vllm-warmup/`.
- **Reload Model** restarts the native WSL vLLM process with the selected model.

The RCA action now also runs the same small inference probe. A PID, listening port, or `/v1/models` response is not enough to mark vLLM healthy; the useful health signal is whether the model can complete a request and whether GPU evidence is captured in the report.

Qdrant is not checked as a direct RuFloUI-to-Qdrant connection line. That edge caused false red Fabric lines when RuFloUI was served from WSL while Qdrant was Docker-scoped. Qdrant remains monitored as:

- the `factory_qdrant` production container,
- memory API stats,
- Factory Brain and Qdrant-backed memory behavior.

## Container Classification

- `production`: current FactoryGrid services such as RuFloUI, RuFlo, LiteLLM, Qdrant, Neo4j, OpenHands, and Qwen worker.
- `legacy`: stopped or old memory-related containers, including old experimental memory/gateway containers.
- `support`: discovered containers that are not production-authoritative.

Legacy memory-related containers are intentionally highlighted in orange so they are visible but not mistaken for the live memory path.

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
