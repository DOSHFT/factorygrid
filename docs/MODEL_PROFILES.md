# FactoryGrid Model Profiles

FactoryGrid must not keep heavyweight GPU models resident by default. On the RTX 4090, vLLM can reserve most VRAM for model weights, KV cache, and optional CUDA graph capture. Use explicit profiles and start models only when a run needs them.

## Profiles

| Profile | Runtime | Purpose | Default state |
| --- | --- | --- | --- |
| `qwen-coder-awq-daily` | vLLM | Normal coding and agent work | Stopped |
| `qwen-coder-awq-batch` | vLLM | Planned high-context batch work | Stopped |
| `redteam-qwq-abliterated-32b` | vLLM | Operator-directed red-team work | Stopped |
| `blueteam-glm` | external | Blue-team review and architecture reasoning | Placeholder |

## Commands

```bash
bin/factory-model-status.sh
bin/factory-model-start.sh qwen-coder-awq-daily
bin/factory-model-stop.sh all
```

When `factory-vllm.service` exists, the wrappers use the user systemd service instead of unmanaged `nohup`. `factory-model-stop.sh all` stops, disables, and masks the service so vLLM does not come back on login or through `factory-stack.service`.

All profiles serve the selected backend model to LiteLLM as `factory-active`. LiteLLM keeps stable aliases such as `qwen-coder-14b` and `mode-a-research`, so agents do not need per-model endpoint changes.

The red-team profile switches the same vLLM backend to the red-team model contract. Override the Hugging Face model id or launch settings only through environment variables when needed:

```bash
FACTORY_REDTEAM_VLLM_MODEL=huihui-ai/QwQ-32B-abliterated \
bin/factory-model-start.sh redteam-qwq-abliterated-32b
```

## Operating Rules

- Keep all heavyweight local models stopped unless an active run needs them.
- Use `qwen-coder-awq-daily` for ordinary coding work.
- Use `qwen-coder-awq-batch` only for planned batch runs.
- Use red-team and blue-team profiles for operator-directed security work.
- Tool freedom is controlled by the active environment and run contract, not by the model profile text.
- Route defensive review and incident analysis through blue-team profiles when that produces clearer evidence.

## Research Notes

- vLLM exposes `--gpu-memory-utilization`, `--max-model-len`, `--max-num-seqs`, and `--enforce-eager`; these are the primary controls used here to reduce GPU pressure.
- Red-team/blue-team model profiles should route through the same vLLM/LiteLLM harness as the rest of FactoryGrid. Do not add a second local model daemon unless the operator explicitly changes the architecture.
- GoldieBench is useful for agentic coding signal, but it is not a security benchmark. Treat it as one input, not as proof that a model is safe for red-team or blue-team autonomy.
