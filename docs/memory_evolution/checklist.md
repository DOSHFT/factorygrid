# FactoryGrid Memory Evolution Checklist

Created: 2026-05-26

## Phase 0 - Backup And Baseline

- [ ] Capture git status before edits.
- [ ] Create full local backup using the existing FactoryGrid backup path.
- [ ] Commit and push current memory evolution docs.
- [ ] Record current memory state: Factory Brain files, Qdrant collections, RuFlo config, and RuFloUI memory API.
- [ ] Keep Qdrant and Markdown as the production fallback during the transition.

## Phase 1 - Docker And Configuration

- [ ] Add Neo4j service to `docker-compose.yml` on existing `factory_net`.
- [ ] Add Neo4j named volumes for data, logs, and imports.
- [ ] Add `.env.example` entries for Neo4j and Graphiti without committing real secrets.
- [ ] Add healthcheck for Neo4j Bolt or HTTP readiness.
- [ ] Verify `docker compose config` passes.

## Phase 2 - Memory Core

- [ ] Create `memory/memory_core.py`.
- [ ] Implement `UltronMemoryCore` with async methods.
- [ ] Initialize Graphiti/Neo4j with robust error handling.
- [ ] Initialize Qdrant fallback without breaking existing memory.
- [ ] Implement `add_memory` / `add_episode` with provenance metadata.
- [ ] Implement hybrid `query` over Graphiti first, Qdrant/file fallback second.
- [ ] Implement structured result merge with source, confidence, and evidence paths.

## Phase 3 - Graph Schema

- [ ] Define entity, episode, artifact, task, run, source, and decision node types.
- [ ] Implement typed relations: `supports`, `contradicts`, `supersedes`, `derived_from`, `used_in`, `invalidated_by`.
- [ ] Add temporal fields: `valid_from`, `valid_until`, `observed_at`, `superseded_at`, `reason`.
- [ ] Preserve file path and task/run provenance on every node and edge.

## Phase 4 - Migration

- [ ] Create migration script for Factory Brain Markdown.
- [ ] Import `workspace/factory-brain/pages/**/*.md` into Graphiti episodes.
- [ ] Import `workspace/research/**/*.{md,json,jsonl}` as source-backed episodes.
- [ ] Import existing `workspace/factory-brain/graph/*.jsonl` nodes/edges.
- [ ] Store Graphiti node IDs back into Qdrant payloads where possible.
- [ ] Produce migration report with counts and failures.

## Phase 5 - RuFlo Agent Integration

- [ ] Add MemoryWriter agent/skill.
- [ ] Add MemoryReader agent/skill.
- [ ] Add MemoryChecker agent/skill.
- [ ] Update Queen workflow to call MemoryReader before planning.
- [ ] Update Documenter workflow to call MemoryWriter after accepted artifacts.
- [ ] Run MemoryChecker after validation/review milestones.
- [ ] Create MemoryRepairTask when validation contradicts stored memory.

## Phase 6 - API And UI

- [ ] Add `/api/memory/evidence-chain`.
- [ ] Add `/api/memory/contradictions`.
- [ ] Add `/api/memory/repairs`.
- [ ] Add `/api/memory/timeline`.
- [ ] Keep current flat memory list working.
- [ ] Add UI indicators for source, temporal validity, superseded state, and evidence links.

## Phase 7 - Validation

- [ ] Unit test memory core fallback behavior when Neo4j is offline.
- [ ] Unit test Qdrant/file fallback behavior.
- [ ] Integration test Neo4j + Graphiti episode write/read.
- [ ] Integration test migration idempotency.
- [ ] Verify RuFloUI still reports nonzero memory entries.
- [ ] Verify Qdrant collection remains intact.
- [ ] Verify Docker stack starts with Neo4j added.

## Phase 8 - Cutover Rules

- [ ] Run Graphiti in shadow mode first.
- [ ] Do not remove Qdrant primary paths until Graphiti migration is verified.
- [ ] Require a rollback note before making Graphiti authoritative.
- [ ] Update `Architecture.md`, `README.md`, and runbooks only after implementation matches docs.
