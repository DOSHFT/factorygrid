# Daily Model + Quantization Watch Report

Generated: 2026-06-23
Owner agents: researcher, coder, blue-team-cell, reviewer
Scope: RTX 4090 / 24 GiB VRAM, FactoryGrid vLLM/LiteLLM single-model-source architecture

## Executive Review

FactoryGrid currently deploys `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` for daily coding and has a stopped red-team profile pointed at `huihui-ai/QwQ-32B-abliterated`. The blue-team GLM profile is still a placeholder.

Today there are better candidates worth evaluating, but not yet replacing production without a local smoke test:

- Coding: `Qwen3-Coder-30B-A3B-Instruct` quantized variants look like the strongest upgrade candidate for agentic coding if they fit with safe vLLM settings on the RTX 4090.
- Coding fallback: `Devstral-Small-2-24B-Instruct-2512` is explicitly positioned for agentic coding and single-4090 class deployment, but vLLM compatibility must be tested because several community notes point to GGUF/AWQ/runtime friction.
- Red/blue security: `huihui-ai/QwQ-32B-abliterated` remains the deployed red-team baseline. Newer abliterated 12B/24B/31B families should be tracked, but none should be promoted until they pass FactoryGrid's security-task benchmark and local VRAM test.
- Efficiency: TurboQuant is the most important vLLM-native research track because FactoryGrid's bottleneck is KV cache/context length on a 24 GiB GPU. Unsloth Dynamic 2.0 GGUF is important for llama.cpp/offline evaluation, but does not yet cleanly replace the current vLLM AWQ path. AirLLM is a research/offload fallback, not an interactive agent runtime candidate unless latency is acceptable.

## Current Deployed Baseline

| Role | Current profile | Model | State | Review |
| --- | --- | --- | --- | --- |
| Daily coding | `qwen-coder-awq-daily` | `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` | stopped by default | Stable, conservative, but likely behind newer 24B-32B coding candidates. |
| Batch coding | `qwen-coder-awq-batch` | `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` | stopped by default | Same model, higher VRAM/context settings. |
| Red team | `redteam-qwq-abliterated-32b` | `huihui-ai/QwQ-32B-abliterated` | stopped by default | Good reasoning-family baseline; must be benchmarked locally. |
| Blue team | `blueteam-glm` | `glm` placeholder | placeholder | Needs concrete local-compatible GLM or alternate defensive reasoning model. |

## Top 3 Agentic Coding Candidates

1. `Qwen3-Coder-30B-A3B-Instruct` quantized AWQ/GGUF
   - Why: strongest current coding-specific candidate in the 30B class; Hugging Face lists multiple quantized variants including AWQ and GGUF; GoldieBench tracks Qwen/Kimi/GLM frontier coding output as part of its one-shot creative coding leaderboard.
   - Fit risk: 30B A3B may still need careful vLLM profile tuning on 24 GiB. Evaluate with `GPU_MEM<=0.58`, `MAX_MODEL_LEN=8192`, `MAX_NUM_SEQS=1`, `ENFORCE_EAGER=true`.
   - Action: create an evaluation task before changing default profile.

2. `Devstral-Small-2-24B-Instruct-2512` quantized
   - Why: explicitly built for agentic coding; Unsloth notes it is light enough for a single RTX 4090 or 32 GB Mac-class local deployment.
   - Fit risk: some community reports note vLLM/model-class friction; GGUF may be easier than vLLM, which conflicts with FactoryGrid's single vLLM source-of-truth unless vLLM support is confirmed.
   - Action: evaluate only if a vLLM-compatible AWQ/NVFP4/GPTQ path works locally.

3. `Qwen/Qwen2.5-Coder-32B-Instruct-AWQ`
   - Why: direct larger sibling of current deployed model; official Qwen collection includes AWQ/GPTQ/GGUF options; lower migration risk than switching families.
   - Fit risk: 32B on RTX 4090 is context/KV constrained; likely acceptable for single-user 8k context, not for large batch/context.
   - Action: benchmark against current 14B baseline and Qwen3-Coder 30B A3B.

## Top 3 Red/Blue Team Candidates

These are model-selection candidates only. Authorization, target scope, and tool boundaries remain operator/run-contract controls.

1. `huihui-ai/QwQ-32B-abliterated`
   - Why: already referenced by FactoryGrid red-team profile; Hugging Face describes it as an uncensored QwQ-32B created with abliteration.
   - Fit risk: not guaranteed refusal-free in every case; 32B VRAM pressure on RTX 4090 requires quantized or tightly capped profile.
   - Action: keep as red-team baseline, add local benchmark.

2. `AliBilge/Huihui-Devstral-Small-2-24B-Instruct-2512-abliterated`
   - Why: potentially combines Devstral agentic-coding/tool behavior with abliterated behavior.
   - Fit risk: newer/community model; must validate model card, license, download integrity, vLLM compatibility, and red/blue task quality.
   - Action: candidate for blue-team/offensive-security lab comparison, not default.

3. `Jiunsong/SuperGemma4-31b-abliterated-GGUF` or current 12B/31B abliterated Gemma/Qwen variants
   - Why: Hugging Face trending/model search shows active abliterated variants in 12B-31B size ranges.
   - Fit risk: GGUF/runtime mismatch with vLLM and unknown security-task quality.
   - Action: track via daily watch, test only if a vLLM-compatible quant appears or llama.cpp sidecar is explicitly approved.

## Efficiency / Bigger-Than-24GB Research Track

1. TurboQuant
   - Priority: P0 research.
   - Why: vLLM has a May 2026 study of TurboQuant KV-cache variants against BF16/FP8 on long-context and reasoning benchmarks. This directly targets FactoryGrid's 24 GiB VRAM/context bottleneck.
   - Task: track vLLM support maturity and whether `--kv-cache-dtype turboquant_*` is usable in our vLLM build without patching.

2. Unsloth Dynamic 2.0 GGUF
   - Priority: P1 research.
   - Why: Unsloth claims per-layer dynamic quantization improvements and publishes many GGUFs, including coding models.
   - Limitation: GGUF is not the current FactoryGrid vLLM path; use for offline candidate exploration unless vLLM GGUF support is confirmed.

3. AirLLM
   - Priority: P2 research.
   - Why: layer-by-layer loading can make large models runnable on tiny VRAM.
   - Limitation: likely too slow for interactive autonomous agents; useful for overnight/offline report generation only if quality beats smaller fully-resident models.

4. AWQ / GPTQ / NVFP4
   - Priority: P1 operational.
   - Why: AWQ is already used by FactoryGrid and is the lowest-risk path for vLLM. NVFP4 may matter for newer Blackwell-class workflows but must be tested on RTX 4090 compatibility.

5. EXL2 / llama.cpp GGUF
   - Priority: P2 architecture watch.
   - Why: strong local single-user performance community, but using it would add a second model runtime and increase drift unless explicitly approved.

## Top 5 Research Resources To Track Daily

1. GoldieBench: current model leaderboard and model pages for qualitative one-shot app/code output.
2. Hugging Face model search/collections: trending quantized, abliterated, AWQ, GGUF, and vLLM-compatible models.
3. vLLM blog + GitHub issues: TurboQuant, KV-cache quantization, AWQ/NVFP4 support, GGUF support, model-class compatibility.
4. Unsloth docs + Hugging Face collections: Dynamic 2.0 quants and Aider/Polglot coding benchmark claims.
5. Reddit `r/LocalLLaMA`: practical RTX 4090 reports, but only as weak evidence that must be verified locally.

## Required Follow-Up Task Items

- [ ] Researcher: produce a daily source-backed model shortlist under `workspace/research/model-watch/YYYY-MM-DD_model_watch.md`.
- [ ] Coder: create a local smoke-test matrix for candidate models with vLLM-safe settings on RTX 4090.
- [ ] Blue-team-cell: create a red/blue model evaluation rubric for sanctioned lab work and compare abliterated candidates.
- [ ] Reviewer: verify licenses, model-card trust, malicious-model risk, and whether each candidate can be downloaded from an acceptable source.
- [ ] Architect: if a candidate beats current baseline, propose one new stopped-by-default model profile. Do not edit runtime profiles until approved.

## Decision

A task item is required because `Qwen3-Coder-30B-A3B-Instruct` and `Devstral-Small-2-24B-Instruct-2512` are plausible upgrades over the deployed 14B Qwen2.5-Coder baseline, and the blue-team GLM profile is still unresolved.

No production profile should be changed until the local benchmark proves:

- model starts through the existing vLLM/LiteLLM path,
- VRAM does not exceed safe RTX 4090 thresholds,
- coding/security task quality beats the current baseline,
- license and model provenance pass review,
- output artifacts and failures are recorded.

## Sources

- GoldieBench leaderboard: https://goldiebench.com/
- GoldieBench tasks/methodology surface: https://goldiebench.com/tasks/
- Hugging Face Qwen3-Coder quantized models: https://huggingface.co/models?other=base_model%3Aquantized%3AQwen%2FQwen3-Coder-30B-A3B-Instruct
- Hugging Face Qwen2.5-Coder collection: https://huggingface.co/collections/Qwen/qwen25-coder
- Hugging Face Qwen2.5-Coder-32B-Instruct-AWQ: https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct-AWQ
- Hugging Face Devstral Small 2 quantized models: https://huggingface.co/models?other=base_model%3Aquantized%3Amistralai%2FDevstral-Small-2-24B-Instruct-2512
- Unsloth Devstral Small 2 GGUF: https://huggingface.co/unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF
- Hugging Face QwQ-32B-abliterated: https://huggingface.co/huihui-ai/QwQ-32B-abliterated
- vLLM TurboQuant study: https://vllm.ai/blog/2026-05-11-turboquant
- TurboQuant paper: https://arxiv.org/abs/2504.19874
- Google Research TurboQuant post: https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/
- Unsloth Dynamic 2.0 docs: https://unsloth.ai/docs/basics/unsloth-dynamic-2.0-ggufs
- Unsloth Dynamic 2.0 collection: https://huggingface.co/collections/unsloth/unsloth-dynamic-20-quants
- AirLLM GitHub: https://github.com/lyogavin/airllm
- Reddit RTX 4090/QwQ vLLM benchmark signal: https://www.reddit.com/r/LocalLLaMA/comments/1jnjrdk/benchmark_rtx_3090_4090_and_even_4080_are/
- Reddit QwQ-32B-abliterated signal: https://www.reddit.com/r/LocalLLaMA/comments/1jlqduz/uncensored_huihuiaiqwq32babliterated_is_very_good/
