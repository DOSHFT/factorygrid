# FactoryGrid Docker Socket Boundary

Last verified: 2026-06-23

## Policy

Docker Engine access is privileged host control. It must not be mounted into general agent containers unless that container has a documented runtime need.

## Current Boundary

No Docker socket:

- `factory_ruflo`: RuFlo orchestrates tasks and calls LiteLLM/RuFlo project state. It does not need Docker Engine control.
- `agent_qwen_code`: idle worker placeholder; no Docker Engine control.

Docker socket retained:

- `factory_rufloui`: Fabric monitoring reads Docker container state through the Docker API when no Docker CLI is available in the container.
- `agent_openhands`: OpenHands uses Docker-backed sandbox/runtime control.

## Destructive Actions

RuFloUI Fabric restart actions are disabled unless the operator explicitly sets:

```env
FACTORY_ALLOW_DOCKER_RESTARTS=true
```

Keep this disabled outside a maintenance window. Monitoring can still read container state with the socket mounted, but restart calls return `docker-restart-blocked`.

## Verification

```bash
docker inspect factory_ruflo factory_rufloui agent_openhands \
  --format '{{.Name}} {{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}'
```

Expected:

- `factory_ruflo` has no `/var/run/docker.sock` mount.
- `factory_rufloui` has `/var/run/docker.sock` only for Fabric monitoring.
- `agent_openhands` has `/var/run/docker.sock` for its sandbox runtime.
