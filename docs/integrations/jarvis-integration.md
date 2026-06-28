# J.A.R.V.I.S. Integration Checklist

Date: 2026-06-28

## Goal

Make J.A.R.V.I.S. a real FactoryGrid operator entrypoint:

```text
J.A.R.V.I.S. -> RuFloUI Factory API -> Spec Kit / Task / Factory Brain -> RuFlo/Hermes workers
```

## Implemented

- [x] J.A.R.V.I.S. runs as Windows-native Mark XLVII runtime.
- [x] J.A.R.V.I.S. startup exports FactoryGrid paths:
  - `FACTORYGRID_ROOT`
  - `FACTORYGRID_FACTORY_BRAIN`
  - `FACTORYGRID_SPEC_KIT`
  - `FACTORYGRID_OBSIDIAN_VAULT`
  - `FACTORYGRID_MODEL_SELF_HEAL`
- [x] `actions/factorygrid.py` added to Mark XLVII.
- [x] Jarvis tool `factorygrid` registered in Mark XLVII `main.py`.
- [x] Tool action `create_intake` calls RuFloUI `/api/factory/intake`.
- [x] Tool action `create_matrix_intake` calls RuFloUI `/api/factory/intake` with a Jarvis matrix payload.
- [x] Tool action `create_task` calls RuFloUI `/api/tasks`.
- [x] Tool action `create_and_run_task` creates a task with `assignTo=swarm`.
- [x] Intake creation can auto-submit a gated swarm task that references Spec Kit/Factory Brain artifacts.
- [x] Tool action `search_memory` calls RuFloUI `/api/factory/brain/search`.
- [x] Tool action `model_self_heal` runs `bin\jarvis-model-self-heal.ps1`.
- [x] Tool action `open_factory` opens `http://localhost:28589/factory`.
- [x] Tool action `open_fabric` opens `http://localhost:28589/monitoring/fabric`.
- [x] Unit tests cover API request shape and auto-submit.

## Current Operator Contract

J.A.R.V.I.S. may auto-submit tasks to the swarm because RuFlo/FactoryGrid gates must still enforce:

- Spec Kit artifact creation.
- Research/provenance before implementation.
- Protected-file and config-file HITL gates.
- Model self-heal/model-routing gate before agent dispatch.
- Factory Brain write-back.

## Not Yet Complete

- [ ] Add a RuFloUI-side service token for Jarvis API calls instead of relying on local network trust.
- [ ] Add a visible Jarvis-origin badge on FactoryGrid task cards.
- [ ] Add a dedicated J.A.R.V.I.S. panel in RuFloUI showing recent spoken goals and produced artifacts.
- [ ] Repair Hermes `revelations-ruflo` MCP and make it an optional provider behind the same adapter.
- [ ] Add end-to-end browser test: speak/type to Jarvis -> Spec Kit files appear -> task appears in RuFloUI -> swarm starts.

## Upgradeability Notes

The Mark XLVII changes are intentionally limited to:

- `actions/factorygrid.py`
- one import in `main.py`
- one Gemini tool declaration in `main.py`
- one dispatcher branch in `main.py`

If Mark XLVII is updated from upstream, reapply those four integration points. The FactoryGrid API contract remains on the RuFloUI side.
