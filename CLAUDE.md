# FactoryGrid / Ruflo / Hermes / RuFloUI — Super CLAUDE.md (Tailored Project Constitution)

**This is the persistent context for Claude Code, Hermes, agents, and any LLM session working in this repo.**  
Read this at the start of every task. It is deliberately concise and points to deeper docs when needed. Date-stamped updates live here or in referenced files.

**Core Identity**: We build a hybrid Windows + WSL2 "FactoryGrid" system for multi-agent research, orchestration, execution, and shared memory. Local LLMs only (no cloud). Everything must survive restarts, cross-distro networking (revelation <-> decima), port proxies, and explicit gates.

**Dual Locations (CRITICAL — you have been operating only in the worktree)**:
- This session's workspace: `C:\Users\Setup User\.grok\worktrees\uat-factorygrid\uat-factorygrid` (git worktree, clean checkout for .grok context).
- **Primary UAT / "real" location you MUST also keep in sync**: `D:\UAT\factorygrid` (larger, contains node_modules/runtime state, the target for portable/UAT use; mounted inside WSL as `/mnt/d/UAT/factorygrid`).
- Live running copies:
  - Revelation WSL (`wsl -d revelation`): `/home/revelation/factorygrid` (Ruflo, Docker stack, vLLM, LiteLLM, rufloui, openhands etc. — the active "FactoryGrid / Revelation" instance).
  - Decima WSL (`wsl -d decima-intelligence-it -u decima`): Hermes dashboard (9119 with --tui CLI), claude-local, research agent, ~/.hermes/.
- Sync rules (run after any structural/MD/code changes):
  - Host -> D:\UAT: manual robocopy or `pwsh -File bin\factory-windows-push.ps1` (or equivalent).
  - Revelation live <-> D:\UAT: `wsl -d revelation -u revelation -- bash -lc 'cd /home/revelation/factorygrid && bin/factory-uat-copy.sh /mnt/d/UAT/factorygrid'` (or the portable-git-sync).
  - Worktree edits must be mirrored to D:\UAT\factorygrid (use absolute writes or post-edit sync). Never assume a change here is visible on the running revelation/decima boxes.
- WSL access patterns: Use `wsl -d revelation -u revelation -- bash -lc 'cmd'` or `wsl -d decima-intelligence-it -u decima -- bash -lc 'cmd'`. Avoid outer pipes that pwsh misparses (e.g. no `wsl ... | cat` in one token if it triggers binding errors). For file writes to WSL use UNC `\\wsl.localhost\Revelation\...` (read_file/search_replace support it) or heredoc inside bash -lc carefully.
- LAN / external: BlackBeast host IP (usually 192.168.178.20), portproxy via `bin\factory-expose-lan.ps1` (elevated). Revelation WSL IP ~172.20.86.232. Decima similar. **Never rely on localhost from another machine.** Proxies include 9119 (Hermes), 7681/7682 (consoles), 18000 (vLLM), 4001 (LiteLLM), 3011 (Ruflo MCP), 28589/28580 (RuFloUI), etc.

## Local LLM Stack (authoritative, non-negotiable)
- Heavy local models are **stopped by default**. Do not auto-start vLLM just because an agent path is unavailable; use `bin/factory-model-start.sh <profile>` only when the run contract requires a local model.
- vLLM profile path: `runtime/model-profiles/qwen-coder-awq-daily.env` for normal coding, `qwen-coder-awq-batch.env` for planned batch work. Default Qwen endpoint, when started, is port **18000** with `--enable-auto-tool-choice --tool-call-parser hermes --quantization awq_marlin --enforce-eager`.
- Red-team profile: `redteam-qwq-abliterated-32b` through the vLLM/LiteLLM OpenAI-compatible harness. It verifies the selected backend and must not start a separate Ollama path unless the operator explicitly changes the architecture. Red/blue autonomy is governed by the active operator-defined environment and run contract.
- LiteLLM (gateway, anthropic compat + OpenAI): port **4001** (docker publish 0.0.0.0:4001:4000 inside revelation). `litellm_config.yaml` has model aliases (`mode-a-research`, `qwen-coder-14b`, `qwen-coder-14b-anthropic`, ...), `supports_auto_tool_choice: true`.
- Reachability:
  - From revelation inside: localhost:4000 (container), 4001 (published).
  - From decima (Hermes): `http://172.20.80.1:4001` (or HOST_IP:4001 via gateway route) or the proxy path.
  - LAN: 192.168.178.20:4001 , 192.168.178.20:18000.
- Test: `curl -H "Authorization: Bearer sk-mode-a-research" http://172.20.80.1:4001/v1/models` (or equivalent) must list the model aliases; `bin/factory-model-status.sh` must show whether the heavy backend is actually running.
- Claude Code / Hermes / agents: always point `ANTHROPIC_BASE_URL` (or equiv) + `ANTHROPIC_MODEL` / `CLAUDE_CODE_MODEL` to the LiteLLM anthropic alias (`qwen-coder-14b-anthropic` or `mode-a-research`).
- Wrappers: `~/.local/bin/claude-local` (decima), `bin/claude-rev.ps1` (host), similar for hermes. ttyd consoles on 7682 (claude) / 7681 (hermes) for browser access. See `docs/agent-readiness/Enable_Claude_Code.md` and `bin/start-hermes.sh`.

## Hermes (the "CLI" + web surface you fought for)
- Runs on decima: dashboard on 9119 (with `--tui` for embedded Chat/Terminal at **top of sidebar** via `__HERMES_DASHBOARD_EMBEDDED_CHAT__` flag injected by web_server when HERMES_DASHBOARD_TUI or --tui), gateway for MCP/CLI.
- Start/persist: `~/start-hermes-dashboard.sh` (auto from .bashrc on interactive login), or `bash ./bin/start-hermes.sh dashboard` (from host worktree — does node ensure, build, wrappers, --tui, ttyd consoles, ensure_hermes_cli_visible).
- MCPs (registered): codex (fs on /home/decima + /mnt/d/...), revelations-ruflo (http://172.20.80.1:3011 or equivalent reachable), github.
- Skills: `research-collaboration-memory` (local, enabled — the bridge to Ruflo), many builtins, `claude-code` skill present.
- Config: `~/.hermes/config.yaml` (model base_url to 4001, mcp_servers, memory.ruflo section with explicit note that Ruflo is **side integration** via MCP+skill while core is built-in only).
- Memory visibility gotcha (see `memory_hermes.md`): `hermes memory status` shows only built-in + registered external **Memory Provider plugins** (e.g. byterover etc.). Ruflo appears via MCP + skill, not as a core provider — this is why it can report "ZERO from Ruflo" even when wired. Use the skill in prompts and test tool calls to Ruflo MCP.
- CLI surface: `hermes` (via ~/.local/bin wrapper setting PYTHONPATH), `hermes dashboard --tui`, `hermes mcp ls`, `hermes skills list`, `hermes doctor`, gateway, etc. Also ttyd 7681 for full TUI in browser.
- UI probes / health: rufloui factory-runtime.ts has Hermes 9119 + claude probes.

## Ruflo + Factory Stack (Revelation)
- `cd /home/revelation/factorygrid && bin/factory-stack.sh start|status|restart|doctor`
- `factory-stack.service` must not `Want=` vLLM. vLLM is controlled by `factory-vllm.service` only through the `factory-model-*` wrappers.
- `bin/factory-env.sh`, `bin/factory-urls.sh` (the post-login banner source — now updated for 18000 + accurate health).
- Health banner on login (via ~/.profile -> factory-urls.sh -> health.sh): expects mostly GREEN after `start`. LAN exposure block may show diagnostic REDs from inside (netsh interop often empty); the real config comes from running the updated `bin\factory-expose-lan.ps1` elevated on BlackBeast (it now includes 9119/Hermes, 768x consoles, 18000 vLLM).
- Key services: factory_litellm (4001), factory_ruflo (3010 internal -> 3011), rufloui (28580/28589), qdrant, agent_*, vllm (18000 native).
- Expose: run the ps1 elevated; it sets netsh portproxy + firewall. Then from DarkStar/LAN use 192.168.178.20:...
- SSH: `ssh revelation@192.168.178.20` (or LAN IP). Banner should now be clean with GREEN containers + vLLM 18000.

## When to Swarm / Use Multi-Agent (from ruflo patterns + server/agents)
- YES for 3+ files, cross-module, new features, research+impl, security/perf, refactor.
- NO for 1-file, 1-2 line, pure docs/config, trivial questions.
- Use per-agent personas in `server/agents/<role>/` (each has AGENTS.md + IDENTITY.md + SOUL.md). Queen coordinates with state-machine discipline, DR snapshots, gates.
- Hermes side: use skills + MCP + SendMessage-style or direct delegation; research-collaboration-memory skill for posting to Ruflo shared memory namespaces.
- Spawn pattern (adapt to claude / hermes): name agents, give comms instructions (who to message next), run in background, STOP and wait after spawn.

## Coding / Workflow Rules (layer on top of Guidelines.md + instructions.md)
- ALWAYS read file(s) before edit (use read_file tool or cat/UNC).
- A prompt implying a file/URL/service exists is not evidence. Check it.
- Current or drift-prone facts require source lookup before implementation.
- Prefer edit over create. No new docs unless requested.
- Product roots own their BOM.md, docs/Architecture.md, configs, etc. Don't pollute factory root.
- DR snapshots / gates before autonomous heavy writes (see server/hooks/, queen SOUL, Guidelines "Principal-Level Build Gate").
- Skillify: anything repeated 2x becomes a skill/script + doc.
- Test: after changes, `npm run build && test` where applicable; run hermes doctor/mcp/skills; curl model endpoints; factory-stack status; wsl health.
- Milestone work requires a backup, verification evidence, git commit, and push.
- Ports/Networking: hardcode awareness of 18000 (vLLM), 4001 (LLM), 3011 (Ruflo MCP), 9119 (Hermes), 7682 (claude console), revelation 172.20.86.232 vs decima, host 172.20.80.1 gateway, LAN 192.168.178.20. Update proxies + expose ps1 when adding.
- Secrets: never commit .env, keys, states (openhands_state, qdrant_storage). Use dummies in docs/examples.
- Routine backups exclude secrets by default. Use `FACTORY_BACKUP_INCLUDE_SECRETS=yes` only for explicit offline/secrets backup handling.
- WSL quoting/pwsh gotchas: prefer native bash scripts (like start-*.sh) executed inside wsl -d ... -- bash -lc '...'; avoid complex one-liner pipes from host that pwsh rebinds.
- Sync after edit: mirror worktree <-> D:\UAT <-> revelation home. Use the bin/*-sync* and bin/*-copy* scripts (or direct UNC writes for live).
- Context: @docs/Guidelines.md , @instructions.md , @Architecture.md (if present), @docs/agent-readiness/Enable_Claude_Code.md , @docs/hermes-skills/research-collaboration-memory.skill.md , @memory_hermes.md (when memory), @docs/memory_evolution/MODEL_A_MEMORY_SCHEMAS.md and MEMORY_CORE_SPEC.md , per-agent server/agents/*/SOUL.md etc. when spawning.
- Prompt/policy research may inform local operating contracts, but do not copy proprietary prompt text into FactoryGrid. Extract patterns: verification, provenance, tool boundaries, output schemas, safety gates, and current-source discipline.
- Claude Code specific: use the ttyd consoles or rev wrappers for local model; MCPs registered in claude_desktop_config.json (factorygrid-ruflo via wsl revelation, decima-hermes-codex etc.).

## Memory Architecture (see MEMORY_EVOLUTION_2026-06.md for the full current plan and evolution)

FactoryGrid uses a hybrid durable memory system designed for multi-agent collaboration and continuous growth:

- **Ruflo** (via revelations-ruflo MCP at the local gateway + the `research-collaboration-memory` skill) provides structured, namespaced, gated writes for proposals, reviews, and consensus (`research:proposal:*`, `research:review:*`, `research:consensus:*`). This is the "side integration" for shared knowledge across revelation, decima, native Hermes Desktop, Queen, and all execution agents. See the skill doc for exact procedure, schemas, and gating.
- **Qdrant** (`factory_memory` collection) + lexical fallback for fast semantic + keyword recall.
- **Markdown factory-brain + workspace/factory-brain** as the human-readable single source of truth (versioned, auditable).
- **Fabric true-memory nodes** (Factory Brain / Qdrant / Neo4j) for observability.

**Key rules for every agent**:
- Search memory (via the research-collaboration-memory skill or direct MCP) *before* starting research, design, or implementation on a topic.
- After any significant finding, review, or failure, write back using the skill (with evidence, confidence, provenance, and links).
- Mistakes and failures must become first-class memories (lessons) so the system does not repeat them. Use explicit `lesson` / `failure_learned_from` / `supersedes` patterns.
- Ruflo appears in `hermes memory status` only as an MCP + skill, not as a built-in Memory Provider plugin. Always test writes/reads end-to-end and use the skill explicitly.
- The goal is that *every* agent (no matter which surface or role) can "walk with" the same evolving knowledge.

See `MEMORY_EVOLUTION_2026-06.md` (new June 2026) for the SAGE-inspired evolution plan, trending alternatives (Graphiti, Mem0, Letta, etc.), concrete integration steps, and how we are closing the gap to evidence-chain retrieval + automatic feedback loops while keeping Ruflo as the durable core.

Cross references: `docs/hermes-skills/research-collaboration-memory.skill.md`, `docs/memory_evolution/`, `rufloui/src/backend/server.ts` (memory endpoints), fabric monitoring, and all agent SOUL.md files.

## Other Guardrails
- For research/ingest: follow docs/research-ingestion.md , context-engineering.md .
- Runbooks: docs/runbooks/ (esp. MEMORY_EVOLUTION_RUNBOOK.md , RUFLO_AGENT_READINESS.md , CUSTOMER_WSL_DEPLOYMENT.md).
- When in doubt on agent behavior: read the relevant server/agents/*/SOUL.md + AGENTS.md + IDENTITY.md first.
- Update this CLAUDE.md (and sub ones) when recurring patterns, ports, or integration points change. Keep it the "constitution".

**Start small, iterate from failures.** Use `/init` (if available in your Claude Code) as a base then overlay this. Reference, don't embed huge files unless the agent will need the whole thing every turn.

See also: README.md, todo-factory.md, docs/FACTORYGRID_WORKFLOW_SPEC.md, the per-product CLAUDE.md/AGENTS.md/SOUL.md files, and the memory_hermes.md plan below.

(Last major tailoring: 2026-06 for Hermes CLI persistence, claude-code local wiring, Ruflo memory side integration, revelation banner accuracy, dual worktree/D:\UAT + WSL locations.)
