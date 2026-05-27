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
