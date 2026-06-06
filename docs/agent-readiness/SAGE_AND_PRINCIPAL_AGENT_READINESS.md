# SAGE And Principal Agent Readiness

Last verified: 2026-06-06

## Current Answer

FactoryGrid is operational as a local, multi-plane development factory. It is ready for senior/principal-level intake, research, architecture, bounded implementation, empirical validation, code review, and durable documentation when the target domain artifacts are present.

It is not yet a fully self-certifying principal engineer for regulated, latency-sensitive, or externally integrated systems without operator-supplied contracts, credentials, test harnesses, and acceptance criteria.

Confidence levels based on the live stack:

- Research + spec + task planning for complex systems: 85%.
- Architecture blueprint with bounded paths and protected-file gates: 82%.
- Autonomous DEV implementation inside existing FactoryGrid/RuFloUI patterns: 80%.
- Autonomous UAT/PROD runtime updates after snapshot, export coverage, and validation: 75%.
- Autonomous implementation of broker/protocol-specific systems without dictionaries, credentials, endpoints, and simulator targets: below 70%.
- Autonomous implementation after required protocol artifacts, repo, simulator, and acceptance tests exist: 85%+.

## Live Runtime Context

| Plane | Current Responsibility |
| --- | --- |
| Windows host `BlackBeast` | browser/operator access, Git/PowerShell, LAN portproxy, `D:\Hermes-Desktop` |
| WSL `Revelation` | vLLM, LiteLLM, RuFlo, RuFloUI, Qdrant, Neo4j, OpenHands, Qwen worker, Factory Brain |
| WSL `decima-intelligence-it` | Hermes dashboard/chat, Hermes CLI, claude-code CLI, ttyd consoles, research sidecar |

Verified on 2026-06-06:

- vLLM serves `Qwen/Qwen2.5-Coder-14B-Instruct-AWQ` on `Revelation:18000`.
- LiteLLM exposes `qwen-coder-14b`, `qwen-coder-14b-anthropic`, `mode-a-research`, and `local-qwen`.
- RuFlo MCP is exposed from Revelation on port `3011`.
- Hermes dashboard is Decima-owned at `http://172.20.86.232:9119/`.
- Windows Hermes Desktop is installed at `D:\Hermes-Desktop`.
- Neo4j is running but unhealthy, so graph memory remains shadow/non-authoritative.

## SAGE Relevance

SAGE, arXiv:2605.12061, was submitted on 2026-05-12. Its useful pattern for FactoryGrid is the closed writer/reader feedback loop: a memory writer incrementally builds structured graph memory from interaction history, while a graph-aware reader retrieves evidence chains and feeds retrieval failures back into memory evolution.

FactoryGrid currently has:

- Factory Brain markdown as human-readable truth.
- Qdrant production vector recall.
- Agent growth artifacts and role pages.
- Run artifacts under `workspace/`.
- Decima Hermes and claude-code as separate agent/operator surfaces.
- Neo4j as a Graphiti-compatible shadow graph candidate.

FactoryGrid still needs:

- Healthy Neo4j/Graphiti write/read path before graph memory becomes authoritative.
- Typed graph entities and edges linked to Factory Brain pages.
- Evidence-chain retrieval rather than only document recall.
- Reader feedback that writes memory repair tasks.
- Decay/conflict/versioning so old conclusions can be superseded.
- A real local embedding endpoint path for production memory, not only lexical fallback behavior.

## Other High-Value Memory/Agent Systems To Track

| System | Fit | Use In FactoryGrid |
| --- | --- | --- |
| SAGE graph-memory | High | Adopt writer-reader feedback loop and evidence-chain repair tasks. |
| Zep Graphiti | High | Temporal knowledge graph model over Neo4j once health is green. |
| Mem0/OpenMemory | Medium-high | Practical external memory API patterns and selective memory writes. |
| Letta/MemGPT | Medium-high | Agent-managed memory blocks and archival/core memory split. |
| LangMem | Medium | Procedural memory and agent behavior improvement patterns. |
| Memgraph | Medium-high | Candidate local graph engine if Neo4j remains unhealthy. |
| Cognee/GraphRAG patterns | Medium | Structured extraction and graph retrieval concepts. |
| Git/versioned memory | High | Keep markdown truth versioned and auditable. |

## Principal-Level Agent Requirements

- Every agent starts with a role-specific growth task and source manifest.
- Every run starts with a DR snapshot.
- Every implementation has an architecture blueprint with allowed write paths.
- Every task uses current research for unstable external dependencies.
- Every code change has live validation output.
- Every review checks diff scope, protected paths, security, performance, and missing tests.
- Every conclusion that enters memory has provenance, timestamp, and conflict handling.
- Every repeated failure becomes a deterministic script, hook, skill, or repair task.
- Every cross-plane action names its runtime owner: Windows, Revelation, Decima, or Docker.

## Gap Checklist

- [ ] Add SAGE-style `memory_edges.jsonl` with typed relations: `supports`, `contradicts`, `depends_on`, `supersedes`, `implements`, `validates`.
- [ ] Add a memory reader endpoint that returns evidence chains, not only matching pages.
- [ ] Add a memory writer job that converts validation/review failures into repair tasks.
- [ ] Repair Neo4j health or replace it with a reliable graph store before promoting graph memory.
- [ ] Replace lexical fallback vectors with a real local embedding endpoint.
- [ ] Add graph store evaluation: Graphiti/Neo4j repair, Memgraph, or lightweight JSONL graph with Qdrant payload links.
- [ ] Add role-specific skill packs for Architect, Tester, Reviewer, Performance-Engineer, GitHub-Risk-Scout, and Blue-Team-CELL.
- [ ] Add domain readiness gates for regulated/latency-sensitive domains.
- [ ] Add perf acceptance profiles for low-latency systems: allocation budget, GC mode, p99 latency, throughput, soak duration.
- [ ] Add dependency freshness checks before implementation.
- [ ] Add protocol artifact requirements for FIX/broker work: dictionaries, counterparty rules of engagement, credentials, endpoint, cert/TLS mode, sequence reset policy.

## Decision For FIX 4.4 Restreamer

The factory may run `PLAN`, `RESEARCH`, and `ARCHITECTURE` now. It must not run autonomous `DEV` until these artifacts exist:

- PrimeXM `dictionary.xml`.
- PrimeXM market-data FIX endpoint, SenderCompID, TargetCompID, credentials, SSL/TLS requirement, heartbeat interval, sequence reset policy.
- cTrader acceptor dictionary/rules of engagement for downstream customers.
- Target repository and build system.
- Acceptance test harness or simulator target.
