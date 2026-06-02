# Agents Skills GitHub Research - 2026-05-20

## Short answer

Yes. We already set up the RuFlo implementation job shape.

Existing repo notes point to:

- `todo-factory.md`: add a RuFlo `Researcher` worker that produces `research_brief.md` and `source_manifest.json`.
- `todo-factory.md`: add `docs/agents/ruflo_agent_prompts.md` with `Queen`, `Architect`, `Researcher`, `Coder`, `Reviewer`, `Tester`, and `Documenter`.
- `agent_contract_patch/docs/agents/deployment_orchestration.md`: Queen -> Researcher -> Architect -> Coder -> Tester -> Reviewer -> Documenter artifact chain.

This report is the first concrete `Researcher`-style artifact for the subject: **Agent Skills / Agents Skill systems**.

## Rating method

Rating favors usefulness for the Revelation / RuFlo factory:

- Skill format compatibility with Claude Code, Codex, Gemini, Cursor, or MCP-style agents.
- Direct value for RuFlo Queen, Researcher, skill governance, and reusable worker prompts.
- Evidence of current maintenance.
- Practical implementation patterns over generic lists.
- Local-first compatibility.

GitHub metadata was checked on 2026-05-20 through GitHub repository API and web search results.

## Top 5 repositories

| Rank | Repository | Rating | Stars / Forks | Last pushed | Why it matters |
| --- | --- | ---: | ---: | --- | --- |
| 1 | [microsoft/skills](https://github.com/microsoft/skills) | 9.2 / 10 | 2351 / 266 | 2026-05-20 | Strong reference for enterprise-grade agent skills, MCP servers, custom agents, and AGENTS.md grounding. Best source for repo structure, install flow, and SDK-specific skill packaging. |
| 2 | [apify/agent-skills](https://github.com/apify/agent-skills) | 8.8 / 10 | 2058 / 221 | 2026-05-15 | Production-grade skills for scraping, automation, actor development, and schema generation. Very useful for RuFlo Researcher and web-data ingestion tasks. |
| 3 | [sentient-agi/EvoSkill](https://github.com/sentient-agi/EvoSkill) | 8.7 / 10 | 779 / 84 | 2026-05-18 | Directly matches the learning loop: auto-discovers and synthesizes reusable agent skills from failed trajectories. Relevant to SONA-style improvement and RuFlo skill evolution. |
| 4 | [simota/agent-skills](https://github.com/simota/agent-skills) | 8.3 / 10 | 37 / 7 | 2026-05-20 | Broad catalog of 140+ specialized agent skills with a Nexus orchestrator concept. Useful for bootstrapping local RuFlo role definitions and agent chains. |
| 5 | [jscraik/Agent-Skills](https://github.com/jscraik/Agent-Skills) | 8.1 / 10 | 4 / 4 | 2026-05-20 | Best governance reference: canonical skills, generated command handles, runtime projections, drift prevention, and small command surfaces. Very aligned with a controlled RuFlo skill control plane. |

## Honorable mentions

| Repository | Fit | Notes |
| --- | --- | --- |
| [OneWave-AI/claude-skills](https://github.com/OneWave-AI/claude-skills) | Medium-high | Large production-ready skill library, including multi-agent execution concepts. Good prompt reference, but more business/general-purpose than RuFlo governance. |
| [pjt222/agent-almanac](https://github.com/pjt222/agent-almanac) | Medium-high | Large curated reference of skills, specialist agents, teams, and visualizations. Useful as a catalog and taxonomy source. |
| [VoltAgent/awesome-claude-skills](https://github.com/VoltAgent/awesome-claude-skills) | Medium | Strong discovery list for official and community skills. Better as an index than an implementation base. |
| [PaulRBerg/agent-skills](https://github.com/PaulRBerg/agent-skills) | Medium | Small, pragmatic personal skill set. Useful examples for end-to-end task, review, research, and skill creation flows. |

## Implementation takeaways for RuFlo

### 1. Add a real Researcher artifact contract

RuFlo Researcher should always emit:

- `research_brief.md`
- `source_manifest.json`
- `repo_rating_table.md`
- `queen_action_items.md`

Minimum fields:

- subject
- searched_at
- search_queries
- repo_url
- stars
- forks
- last_pushed
- fit_score
- adoption_decision
- implementation_notes
- risk_notes

### 2. Create a local Agent Skills governance layer

Use `jscraik/Agent-Skills` as the strongest pattern source for:

- canonical skill source
- generated command handles
- runtime projections
- validation before install
- drift checks
- small operator-facing command surface

### 3. Add a learning loop

Use `sentient-agi/EvoSkill` as the main inspiration for:

- creating skills from failed RuFlo / OpenHands runs
- evaluating skill variants before promotion
- storing skill effectiveness in SONA
- linking skill changes to validation reports

### 4. Bootstrap the RuFlo agent catalog

Use `simota/agent-skills`, `OneWave-AI/claude-skills`, and `pjt222/agent-almanac` as prompt and role references, not direct runtime dependencies.

Start with these local skills:

- `ruflo-researcher`
- `ruflo-queen-decomposer`
- `ruflo-architect-boundary-mapper`
- `ruflo-coder-bounded-diff`
- `ruflo-reviewer-risk-scorer`
- `ruflo-tester-validation-runner`
- `agent-skill-supply-chain-audit`

### 5. Use Apify skills for research ingestion

`apify/agent-skills` is the best fit for web-data collection workflows. It should feed the future Firecrawl/Tavily/Qdrant research layer, not replace it.

## Security / attack notes

No 5G attack research was performed because the requested subject here is Agent Skills.

Relevant risk found for this subject:

- Agent skill systems introduce a supply-chain surface: malicious `SKILL.md`, command handles, plugin manifests, MCP tool descriptions, helper scripts, and generated runtime projections can steer agents into unsafe behavior.
- Several repos are actively updated, which is good for usefulness but means direct dependency adoption should be gated.
- Do not install unknown skill packs wholesale into the production RuFlo environment.

## Queen action item

Create a new skill file:

```text
docs/agents/skills/agent-skill-supply-chain-audit/SKILL.md
```

Purpose:

Audit third-party agent skill repositories before installation or adaptation into RuFlo.

Required checks:

- Identify all `SKILL.md`, `AGENTS.md`, plugin manifests, MCP configs, helper scripts, and install scripts.
- Flag shell execution, network calls, credential handling, model/tool routing changes, and hidden persistence.
- Separate prompt-only content from executable code.
- Require source URL, commit SHA, license, last pushed date, and local adaptation decision.
- Output `skill_audit_report.md` and `queen_install_decision.md`.

Priority:

P1. This should be created before importing any third-party skill pack into the active RuFlo runtime.

## Proposed RuFlo job

```text
JOB: research-agent-skills-repos

Queen:
  Decompose "Agent Skills repository research" into bounded research, rating, governance, and action-item tasks.

Researcher:
  Search current GitHub repositories for agent skills, skill frameworks, and AI coding-agent skill packs.
  Produce research_brief.md, repo_rating_table.md, source_manifest.json, and queen_action_items.md.

Architect:
  Define local folder and schema for reusable research artifacts.
  Define safe boundaries for adapting third-party skills.

Coder:
  Add the artifact templates and optional helper script for GitHub metadata capture.

Reviewer:
  Check for supply-chain risks and unsupported assumptions.

Tester:
  Validate that the artifact format is reproducible from a fresh query.

Documenter:
  Update docs/agents/ruflo_agent_prompts.md and docs/research/README.md.
```

## Source links

- https://github.com/microsoft/skills
- https://github.com/apify/agent-skills
- https://github.com/sentient-agi/EvoSkill
- https://github.com/simota/agent-skills
- https://github.com/jscraik/Agent-Skills
- https://github.com/OneWave-AI/claude-skills
- https://github.com/pjt222/agent-almanac
- https://github.com/VoltAgent/awesome-claude-skills
- https://github.com/PaulRBerg/agent-skills
