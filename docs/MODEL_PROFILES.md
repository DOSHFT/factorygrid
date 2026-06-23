# FactoryGrid Model Profiles

FactoryGrid must not keep heavyweight GPU models resident by default. On the RTX 4090, vLLM can reserve most VRAM for model weights, KV cache, and optional CUDA graph capture. Use explicit profiles and start models only when a run needs them.

## Profiles

| Profile | Runtime | Purpose | Default state |
| --- | --- | --- | --- |
| `qwen-coder-awq-daily` | vLLM | Normal coding and agent work | Stopped |
| `qwen-coder-awq-batch` | vLLM | Planned high-context batch work | Stopped |
| `redteam-qwq-abliterated-32b` | Ollama | Authorized red-team exploration | Stopped and gated |
| `blueteam-glm` | external | Blue-team review and architecture reasoning | Placeholder |

## Commands

```bash
bin/factory-model-status.sh
bin/factory-model-start.sh qwen-coder-awq-daily
bin/factory-model-stop.sh all
```

When `factory-vllm.service` exists, the wrappers use the user systemd service instead of unmanaged `nohup`. `factory-model-stop.sh all` stops, disables, and masks the service so vLLM does not come back on login or through `factory-stack.service`.

Red-team models require an explicit local gate:

```bash
FACTORY_ALLOW_REDTEAM_MODEL=yes bin/factory-model-start.sh redteam-qwq-abliterated-32b
```

## Operating Rules

- Keep all heavyweight local models stopped unless an active run needs them.
- Use `qwen-coder-awq-daily` for ordinary coding work.
- Use `qwen-coder-awq-batch` only for planned batch runs.
- Use abliterated/red-team models only in authorized lab workspaces.
- Do not give red-team profiles Docker socket access, broad filesystem write access, or autonomous external actions.
- Route security defensive review and incident analysis through blue-team profiles.

## Research Notes

- vLLM exposes `--gpu-memory-utilization`, `--max-model-len`, `--max-num-seqs`, and `--enforce-eager`; these are the primary controls used here to reduce GPU pressure.
- Ollama serves a local HTTP API at `http://localhost:11434/api` and supports model pull/list/run workflows, which makes it better for stopped-by-default local experimentation.
- GoldieBench is useful for agentic coding signal, but it is not a security benchmark. Treat it as one input, not as proof that a model is safe for red-team or blue-team autonomy.
