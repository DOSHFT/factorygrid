# Task Plan: Daily Model + Quantization Watch

Run ID: daily-model-quant-watch-20260623
Status: active
Owner: Queen
Assigned agents: researcher, coder, blue-team-cell, reviewer, architect

## Tasks

- [ ] Researcher: create tomorrow's source-backed model watch report under `workspace/research/model-watch/`.
- [ ] Researcher: include GoldieBench, Hugging Face, Reddit, official model cards, and official runtime docs.
- [ ] Coder: define local smoke tests for RTX 4090-safe vLLM startup, LiteLLM alias visibility, a small coding task, and VRAM ceiling.
- [ ] Blue-team-cell: define a sanctioned red/blue model rubric that scores refusal behavior, reasoning, tool-use fit, provenance, and lab-scope suitability.
- [ ] Reviewer: reject any model with unclear license, suspicious uploader/provenance, missing checksums, or incompatible runtime path.
- [ ] Architect: create a profile proposal only when a candidate beats current baseline and does not add a second always-on model server.

## Candidate Benchmark Queue

1. `Qwen3-Coder-30B-A3B-Instruct` quantized AWQ/GGUF/NVFP4 variants.
2. `Devstral-Small-2-24B-Instruct-2512` quantized variants.
3. `Qwen/Qwen2.5-Coder-32B-Instruct-AWQ`.
4. `huihui-ai/QwQ-32B-abliterated`.
5. Devstral/Qwen/Gemma abliterated 12B-31B variants that can run locally.

## Non-Negotiables

- Do not auto-edit `runtime/model-profiles/`.
- Do not start heavyweight models outside an explicit benchmark run.
- Do not add Ollama or another model daemon; use vLLM/LiteLLM unless operator approves a lab exception.
- Keep red/blue activity inside sanctioned scope and artifact every decision.
- Create a benchmark task item if and only if the candidate is plausibly better than deployed baseline.
