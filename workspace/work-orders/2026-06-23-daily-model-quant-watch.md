# Work Order: Daily Model + Quantization Watch

Created: 2026-06-23
Status: active
Cadence: daily manual/autonomous now; Jarvis scheduling later
Write scope: `workspace/research/model-watch/`

## Objective

Run a daily research and review loop for:

1. Agentic coding models that fit or plausibly fit an RTX 4090.
2. Red/blue team model candidates, including abliterated/no-refusal variants for sanctioned lab work.
3. Quantization/offload/runtime technologies that may make larger or better models practical without adding model-runtime drift.

## Agent Assignments

| Agent | Responsibility | Output |
| --- | --- | --- |
| researcher | Check GoldieBench, Hugging Face, Reddit, official model cards, and model benchmark sources. | `workspace/research/model-watch/YYYY-MM-DD_model_watch.md` |
| coder | Check vLLM/SGLang/llama.cpp compatibility and proposed safe RTX 4090 launch settings. | candidate smoke-test matrix |
| blue-team-cell | Review red/blue model fit for sanctioned lab work and build a scoring rubric. | red-blue model review section |
| reviewer | Check license, trust, model-card provenance, malicious-model risk, and source quality. | review notes + promotion/hold decision |
| architect | Decide whether a better model warrants a new stopped-by-default profile proposal. | task item only, no protected config edits |

## Daily Checklist

- [ ] Pull current GoldieBench model/task pages.
- [ ] Pull current Hugging Face trending/updated models for: coding, AWQ, GGUF, vLLM, abliterated, uncensored, red-team/security.
- [ ] Pull current Reddit `r/LocalLLaMA` practical RTX 4090 reports.
- [ ] Rank top 3 coding models for FactoryGrid agentic development.
- [ ] Rank top 3 red/blue lab models, with abliterated/no-refusal candidates clearly marked.
- [ ] Review TurboQuant, Unsloth Dynamic 2.0, AirLLM, AWQ/GPTQ/NVFP4, and any new runtime technique.
- [ ] If a candidate appears better than deployed baseline, create a task item to benchmark it locally.
- [ ] Do not edit runtime model profiles automatically. Profile changes require operator review.

## Promotion Gate

A model can be proposed for FactoryGrid only if it:

- starts through the existing vLLM/LiteLLM architecture or has an approved exception,
- remains stable under RTX 4090 safe settings,
- beats the current baseline on the local coding/security task suite,
- has acceptable provenance/license,
- has a rollback path and stopped-by-default profile.

## First Required Task Items

- [ ] Evaluate `Qwen3-Coder-30B-A3B-Instruct` AWQ/GGUF variants against current `Qwen2.5-Coder-14B-Instruct-AWQ`.
- [ ] Evaluate `Devstral-Small-2-24B-Instruct-2512` vLLM-compatible quantized variants.
- [ ] Resolve concrete `blueteam-glm` replacement/profile candidate or rename the placeholder.
- [ ] Benchmark `huihui-ai/QwQ-32B-abliterated` under current red-team profile safe settings.
- [ ] Track vLLM TurboQuant maturity and decide whether it can safely enter a lab branch.

## Seed Report

See `workspace/research/model-watch/2026-06-23_daily_model_quant_report.md`.
