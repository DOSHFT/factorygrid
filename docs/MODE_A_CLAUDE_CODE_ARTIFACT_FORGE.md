# Mode A — Claude Code Artifact Forge (Production Design)
**Date:** 2026-06-01  
**Author:** Grok (with full research sweep)  
**Status:** Design complete + wrappers hardened and tested (June 2026). See "Implementation Status" section at the bottom for current state of delivered artifacts.  
**Confidence Target:** ≥90% improvement to stack with zero breakage to existing governance, memory, or runtime

---

## 1. Executive Summary & Strategic Fit

You have built a **deliberately constrained, artifact-driven autonomous factory** with:
- Spec-Kit + Queen validation front door
- Python gate chain (architecture, diff scope, validation, review)
- Capability matrix with explicit allow/block
- Recently landed **Bounded Execution Phase 0** (deterministic classification + side-effect execution with full evidence contract)
- Custom memory reality (Ruflo native + hive-mind + rufloui in-process + .ruflo/ JSON; Qdrant is legacy)

**The highest-leverage missing piece** is high-quality, long-horizon research that can feed the intake without destroying the gates.

**The BEST solution under your exact constraints (local-only, single RTX 4090 24 GB, heavily customized Ruflo/RuFloUI, extreme "do not break my shit" requirement):**

**"Mode A — Claude Code Artifact Forge"**

Use the **official Anthropic `claude` CLI** (the real Claude Code agent scaffolding) as an *external, isolated, contract-enforced Research Specialist*.

- It is pointed **exclusively** at your local models via your existing LiteLLM gateway.
- It is **never** given write access to the live factory.
- It is forced (via system prompt + wrapper + working directory constraints) to output **only** the exact artifact formats your existing pipeline already understands and validates (`research_brief.md`, `architecture_blueprint.json`, task breakdowns, etc.).
- All its recommendations become normal Spec-Kit intake items that must pass Queen + your Python gates + (for concrete actions) the new bounded executor.

This is the clean realization of the "Mode A vs Mode B" vision discussed throughout the project.

**Why this is superior to alternatives under your constraints:**
- Better agentic scaffolding than hand-rolled shims or pure Aider for research synthesis + structured artifact production.
- Officially supported integration path (Anthropic docs explicitly endorse LiteLLM gateways with the required header forwarding).
- Leverages the 4090's full capability with current-best local models for this exact workload.
- Adds capability **without mutating** server.ts, core Ruflo orchestration, memory stores, Docker services, or capability matrix.
- Reuses every piece of governance you have already paid for (including the bounded executor you just merged).

---

## 2. Hardware & Model Reality (RTX 4090 24 GB, Mid-2026)

Single 4090 remains excellent for serious agentic research in 2026 when using the right model class.

**Recommended primary Mode A brain:**
- **Qwen3.6-35B-A3B** (MoE: 35B total params, ~3B active) — released ~April 2026.
  - Current community leader for agentic/tool-use/research/coding on consumer 24 GB cards.
  - Excellent long-horizon reasoning, preserved "thinking" traces across turns, strong parallel tool calling, structured output, repository-level analysis, and research synthesis.
  - Strong on SWE-Bench style + broader agentic evals when properly scaffolded.

**Best quant for your workload (research output quality first):**
- **Q5_K_M (Unsloth Dynamic/UD-Q5 or equivalent high-quality imatrix GGUF)** — ~21–22.5 GB loaded.
  - Sweet spot: near-FP8 quality on reasoning/tool calling with usable speed (typically 40–80+ t/s on 4090 depending on context and backend).
  - Noticeably better long-chain coherence and fewer tool-use hallucinations than Q4 for research tasks.

**Acceptable faster alternative:**
- Q4_K_M / UD-Q4_K_XL / IQ4_XS (~19–21 GB) — higher t/s, still very usable. Drop to this only if you need maximum context or iteration speed.

**Serving stack (production):**
- Primary: **vLLM** (best throughput, prefix caching, good OpenAI-compatible + tool calling support).
- Front: Your existing **LiteLLM** (you already run this as the central gateway — perfect).
- Fallback: llama.cpp server or Ollama if you need GGUF-specific features.

**VRAM budget reality:**
- Leave headroom for KV cache at 64k–128k context (critical for serious research sessions).
- MoE efficiency helps enormously.
- 64 GB+ system RAM is highly recommended for context overflow and smooth agent loops.

**Secondary models (keep your existing ones for factory execution):**
- Use smaller/faster models for the actual bounded execution workers and swarm agents.
- Mode A runs on the strongest research-capable model you can fit; execution uses the disciplined, narrower models + your gates.

---

## 3. Architecture — Zero Breaking Changes

### Core Principle
**Claude Code CLI is a high-quality external input generator, never an internal participant.**

### Data Flow (Safe)
```
Human verbal idea or "I need deep research on X"
          │
          ▼
Mode A Wrapper (new, constrained `claude` invocation)
  - Forces read-only or git-worktree view of main codebase
  - Strict system prompt + output contract (only your artifact formats)
  - Runs in dedicated research-incoming/ working dir
  - All writes go only to allowed research staging area
          │
          ▼
Produced artifacts (research_brief.md, architecture_blueprint.json, etc.)
          │
          ▼
Existing Spec-Kit intake / Queen validation (unchanged)
          │
          ▼
Python gates (unchanged)
          │
          ▼
Bounded Execution lane (the one you just merged) for any concrete side effects
          │
          ▼
Your normal memory promotion paths (with proper provenance)
```

### No Changes To:
- `RuFloUI/src/backend/server.ts` (the recent merge stays pristine)
- Core Ruflo orchestration or Docker services
- Existing memory stores (Ruflo CLI memory, hive-mind, rufloui in-memory, .ruflo/)
- Capability matrix or Python gate logic
- Running factory behavior for Mode B / normal tasks

### New Surface Area (Minimal & Reversible)
1. LiteLLM config addition (one model alias + required settings).
2. One production wrapper script (`factory-mode-a-research`).
3. One strong, version-controlled system prompt / CLAUDE.local.md variant for Mode A.
4. Optional later: tiny ingestion helper that turns approved research artifacts into formal Spec-Kit items.
5. Documentation updates only.

---

## 4. Exact Production Configuration (LiteLLM + Claude Code)

### LiteLLM Addition (add to your existing `litellm_config.yaml`)

```yaml
model_list:
  # === MODE A RESEARCH SPECIALIST (on your 4090) ===
  - model_name: mode-a-qwen36-research
    litellm_params:
      model: openai/Qwen3.6-35B-A3B   # exact name you use in vLLM
      api_base: http://vllm:18000/v1   # or host.docker.internal:18000 from WSL/Windows
      api_key: "sk-anything"          # vLLM ignores or accepts anything
    model_info:
      max_input_tokens: 131072
      max_tokens: 32768
      supports_vision: false          # adjust if you use multimodal variant

general_settings:
  forward_client_headers_to_llm_api: true   # CRITICAL — forwards anthropic-beta, x-claude-code-*, etc.
  master_key: ${LITELLM_MASTER_KEY}

litellm_settings:
  drop_params: true
  drop_unsupported_params: true
  parse_tool_call_from_content: true
```

### Claude Code Environment (set in wrapper or ~/.claude/settings.json)

```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"          # or the Docker service name
export ANTHROPIC_AUTH_TOKEN="sk-1234567890abcdef"          # must match your LiteLLM master/virtual key

# Performance critical for local backends
export CLAUDE_CODE_ATTRIBUTION_HEADER=0                    # Prevents KV cache destruction on vLLM
export CLAUDE_CODE_ENABLE_TELEMETRY=0
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1

# Optional but recommended for research focus
export CLAUDE_CODE_MAX_RETRIES=3
```

In `~/.claude/settings.json` (persistent):

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4000",
    "ANTHROPIC_AUTH_TOKEN": "sk-...",
    "CLAUDE_CODE_ATTRIBUTION_HEADER": "0",
    "CLAUDE_CODE_ENABLE_TELEMETRY": "0"
  }
}
```

This configuration is directly supported by Anthropic's official 2026 LLM Gateway documentation.

---

## 5. The Mode A Wrapper (The Safety Boundary)

The wrapper is the single most important new artifact. It enforces:

- Dedicated, constrained working directory (`workspace/research-incoming/<run-id>/`)
- Read-only or git-worktree access to the main factory codebase for analysis
- Strict output contract (only allowed artifact files in allowed locations)
- No access to protected paths or live runtime configs
- Automatic post-run hashing + proposal as Spec-Kit intake item

See the companion script `factory-mode-a-research.sh` (to be created in `factorygrid_patch/bin/`).

Example invocation contract the wrapper enforces:

```markdown
You are Mode A Research Specialist for the Revelation FactoryGrid.

MANDATORY OUTPUT CONTRACT (non-negotiable):
- You may ONLY create files under the current research-incoming directory.
- You MUST produce at minimum:
  1. `research_brief.md` (structured: sources, key findings, trade-offs, recommendation)
  2. `architecture_blueprint.json` (if architecture is in scope)
  3. `task_breakdown.md` or equivalent (if implementation tasks are proposed)
- Every claim must be traceable to a source you actually read in this session.
- You are FORBIDDEN from:
  - Touching any file outside the research staging area
  - Running commands that modify the live factory
  - Writing directly to Ruflo memory, hive-mind, or .ruflo/
  - Bypassing any documented gate or capability boundary

When finished, state clearly: "MODE A RESEARCH COMPLETE. Artifacts ready for Queen intake."
```

This prompt lives in a version-controlled file and is loaded by the wrapper.

---

## 6. Implementation Phases (Small, Reviewable, Reversible)

**Phase 0 (Done)**: Research + this design document.

**Phase 1 (Safest first artifact)**:
- Add the `mode-a-qwen36-research` entry to LiteLLM config.
- Create the `factory-mode-a-research.sh` (and .ps1) wrapper skeleton that sets env, creates isolated dir, launches `claude` with the contract prompt.
- Test manually in a throwaway research dir. Verify it only writes where allowed.

**Phase 2**:
- Harden wrapper (read-only git worktree mount option, explicit tool allowlist in prompt, post-run artifact validator + hash manifest).
- Add small section to `capability_matrix.md` documenting Mode A role and its strict output-only contract.

**Phase 3** (optional but high value):
- Tiny ingestion bridge (script that takes a completed Mode A research dir and creates a proper Spec-Kit intake item with provenance).

**Phase 4**:
- Optional one-way memory promotion for high-value findings (only after Queen approval).
- Update `claude_code_migration.md` and `alignment.md` with as-built reality.

Every phase produces a small, reviewable diff. Full rollback is just "git checkout the backed-up files".

---

## 7. Risk Register & Mitigations (Why ≥90% Confidence)

| Risk | Severity in naive integration | Severity in this design | Mitigation |
|------|-------------------------------|--------------------------|----------|
| Destructive writes to live factory | High | Very Low | Wrapper + dedicated staging dir + no host mounts for live paths |
| Memory poisoning / conflicting guidance | High | Low | Zero direct writes to any Ruflo/hive-mind/rufloui memory. Only through approved artifacts |
| Local model tool-calling quality gap vs native Claude | Medium | Medium (acceptable) | Strong contract prompt + human/Queen review gate + bounded executor as execution sink |
| KV cache / performance destruction on vLLM | High | Low | Explicit `CLAUDE_CODE_ATTRIBUTION_HEADER=0` + tested LiteLLM settings |
| Header forwarding breakage | Medium | Low | Official LiteLLM + Anthropic documented settings (`forward_client_headers_to_llm_api: true`) |
| Breaking existing Mode B / normal tasks | High | None | Mode A is completely separate invocation path; no code changes to server.ts or orchestration |
| Future Claude Code CLI updates | Medium | Low | Wrapper is thin + version-pinned prompt contract; easy to adapt |

The design deliberately stays on the "external high-quality input" side of the line you have drawn repeatedly.

---

## 8. Immediate Next Actions (When Approved)

1. Review + approve this document.
2. I create the first production artifacts (LiteLLM snippet + wrapper script + initial Mode A prompt contract) in small, reviewable chunks with backups.
3. You test the wrapper manually against a strong local model on your 4090.
4. Once comfortable, we wire the output into your existing Spec-Kit intake (Phase 2/3).

This is the lowest-risk, highest-leverage path that actually moves the needle on "very heavy autonomous research" while respecting every constraint you have stated for the entire history of this project.

---

**References (from research sweep)**:
- Official Anthropic Claude Code LLM Gateway docs (2026)
- LiteLLM Claude Code compatibility patterns + header forwarding requirements
- r/LocalLLaMA / HF consensus on Qwen3.6-35B-A3B for single 24 GB agentic research (mid-2026)
- Multiple documented failure modes of naive "wrap the CLI in a big factory" approaches (security, memory conflicts, orchestration fragility)

Ready when you are. Say the word and we begin Phase 1 production artifacts.
---

## Implementation Status (Updated 2026-06-01)

**Wrappers Status: Hardened & Tested**

Both production wrappers have been significantly improved:

- Robust pre-flight checks (environment variables, directory writability, claude binary detection)
- Automatic un-manifest.json creation with run metadata
- Full-featured --dry-run / -DryRun mode that exercises all logic without launching the agent
- Clean logging and error handling
- Cross-platform feature parity between .sh and .ps1
- Syntax validated (bash + PowerShell)
- Successfully executed in dry-run mode on the actual Windows host + WSL environment

**Files Ready for Use:**
- actorygrid_patch/bin/factory-mode-a-research.sh
- actorygrid_patch/bin/factory-mode-a-research.ps1

**Next Recommended Step:**
Configure the LiteLLM model alias (see litellm-mode-a-config.example.yaml), then run a real Mode A session using the dry-run first for safety.

All changes remain fully isolated and reversible.
