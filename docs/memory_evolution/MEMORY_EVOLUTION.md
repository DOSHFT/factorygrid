# MEMORY_EVOLUTION.md
**Project Ultron / FactoryGrid — Memory System Evolution**

**Version**: 1.0 (Fast-Track Production Implementation)  
**Date**: 2026-05-26  
**Author**: Grok (via Web UI)  
**Goal**: Upgrade from basic vector + markdown memory to a **hybrid temporal knowledge graph system** with SAGE-style self-evolution loops.

### 1. Problem Statement
Current memory system (Qdrant + Markdown) is **not production ready** for true autonomy because:
- No temporal reasoning (cannot handle fact evolution)
- Weak relationship modeling
- No automatic contradiction detection or self-repair
- Noise accumulation over time

### 2. References & Research
- [Graphiti — Temporal Knowledge Graphs for Agents](https://github.com/getzep/graphiti)
- [SAGE: Self-evolving Agents with Reflective and Memory-augmented Abilities](https://arxiv.org/abs/2409.00872)
- Mem0 (optional complementary layer): https://github.com/mem0ai/mem0

### 3. Target Architecture
- **Working Memory**: In-context + session files
- **Semantic Memory**: Qdrant (keep + enhance)
- **Episodic & Strategic Memory**: **Graphiti** (Neo4j backend)
- **Consolidated Knowledge**: Factory Brain Markdown (auto-updated)

**Typed Graph Relations** (to implement):
- `supports`
- `contradicts`
- `supersedes` (with `valid_from`, `valid_until`, `reason`)
- `derived_from`
- `used_in`
- `invalidated_by`

### 4. Implementation Files
See the following detailed specs in this folder:
- `DOCKER_MEMORY.md` → Docker + Neo4j setup
- `MEMORY_CORE_SPEC.md` → Core Python service
- `MEMORY_AGENTS.md` → RuFlo SAGE agents
- `IMPLEMENTATION_CHECKLIST.md` → Execution plan

**Hand-off Instruction for Codex / Grok CLI / RuFlo Queen**:
Implement everything in this folder step by step, starting with Docker, then memory_core.py.