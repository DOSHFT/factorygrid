# FactoryGrid Revelation Stack

FactoryGrid turns written product ideas into researched specs, plans, tasks, code changes, validation reports, review logs, and durable memory.

## Primary URLs

- Factory intake and brain: http://localhost:28588/factory
- RuFlo UI: http://localhost:28580
- OpenHands: http://localhost:3000
- LiteLLM: http://localhost:4000/v1
- vLLM: http://localhost:8000/v1
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
