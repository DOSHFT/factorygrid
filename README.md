# FactoryGrid Revelation Stack

FactoryGrid turns written product ideas into researched specs, plans, tasks, code changes, validation reports, review logs, and durable memory.

## Primary URLs

- Factory intake and brain: http://localhost:28589/factory
- RuFlo UI: http://localhost:28580
- OpenHands: http://localhost:3001
- LiteLLM: http://localhost:4001/v1
- vLLM diagnostics only: http://localhost:18000/v1
- Qdrant: http://localhost:6333

## Start / Check

```bash
cd /home/revelation/factorygrid
docker compose up -d
bin/factory-doctor.sh
```

## Workflow

Start build requests at `/factory`, not in random chat windows. The page creates Spec Kit artifacts and a Factory Brain run page. After the spec/checklist is reviewed, RuFlo/Queen can move the request through research, architecture, tasks, Docker-scoped DEV execution, validation, review, and documentation.

## Memory Rule

Factory Brain is the readable source of truth. Qdrant is recall. Agents should check the brain before making plans or writing code.

## Principal Agent Readiness

The factory now has a documented principal-readiness track at `docs/agent-readiness/SAGE_AND_PRINCIPAL_AGENT_READINESS.md`. It records the current maturity level, SAGE-inspired memory gaps, and the requirements for letting agents implement complex multilayer systems. Complex regulated or latency-sensitive systems must enter through `/factory`, produce research and architecture artifacts, and pass protocol/input gates before DEV execution.

## FactoryGrid LAN / Monitoring

- Fabric monitor: http://192.168.178.20:28589/monitoring/fabric
- Factory UI: http://192.168.178.20:28589/factory
- OpenHands: http://192.168.178.20:3001
- LiteLLM: http://192.168.178.20:4001/v1/models
- vLLM diagnostics only: http://192.168.178.20:18000/v1/models

Startup commands after SSH login:

```bash
cd /home/revelation/factorygrid
bin/factory-stack.sh start
bin/factory-stack.sh status
```

Component update policy: startup/manual update checks create a work-order in
`workspace/work-orders/`. No updates are implemented until a snapshot and
rollback plan is researched and approved by Queen.

Claude Code CLI optional install:

```bash
cd /home/revelation/factorygrid
bin/factory-install-claude-code.sh
```

RuFloUI is configured to point Claude Code at LiteLLM with `ANTHROPIC_BASE_URL=http://litellm:4000`, `ANTHROPIC_AUTH_TOKEN=$FACTORY_API_KEY`, and `ANTHROPIC_MODEL=qwen-coder-14b`.
