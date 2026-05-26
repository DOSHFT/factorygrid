# FactoryGrid Memory Evolution Checklist

Created: 2026-05-26

## Phase 0 - Backup And Baseline

- [x] Capture git status before edits.
- [x] Create full local backup using the existing FactoryGrid backup path.
- [x] Commit and push current memory evolution docs.
- [x] Record current memory state: Factory Brain files, Qdrant collections, RuFlo config, and RuFloUI memory API.
- [x] Keep Qdrant and Markdown as the production fallback during the transition.

## Phase 1 - Docker And Configuration

- [x] Add Neo4j service to `docker-compose.yml` on existing `factory_net`.
- [x] Add Neo4j named volumes for data, logs, and imports.
- [x] Add `.env.example` entries for Neo4j and Graphiti without committing real secrets.
- [x] Add healthcheck for Neo4j Bolt or HTTP readiness.
- [x] Verify `docker compose config` passes.

## Phase 2 - Memory Core

- [x] Create `memory/memory_core.py`.
- [x] Implement `UltronMemoryCore` with async methods.
- [x] Initialize Graphiti/Neo4j with robust error handling.
- [x] Initialize Qdrant fallback without breaking existing memory.
- [x] Implement `add_memory` / `add_episode` with provenance metadata.
- [x] Implement hybrid `query` over Graphiti first, Qdrant/file fallback second.
- [x] Implement structured result merge with source, confidence, and evidence paths.

## Phase 3 - Graph Schema

- [x] Define entity, episode, artifact, task, run, source, and decision node types.
- [x] Implement typed relations: `supports`, `contradicts`, `supersedes`, `derived_from`, `used_in`, `invalidated_by`.
- [x] Add temporal fields: `valid_from`, `valid_until`, `observed_at`, `superseded_at`, `reason`.
- [ ] Preserve file path and task/run provenance on every node and edge.

## Phase 4 - Migration

- [x] Create migration script for Factory Brain Markdown.
- [x] Import `workspace/factory-brain/pages/**/*.md` into Graphiti episodes.
- [x] Import `workspace/research/**/*.{md,json,jsonl}` as source-backed episodes.
- [x] Import existing `workspace/factory-brain/graph/*.jsonl` nodes/edges.
- [ ] Store Graphiti node IDs back into Qdrant payloads where possible.
- [x] Produce migration report with counts and failures.

## Phase 5 - RuFlo Agent Integration

- [x] Add MemoryWriter agent/skill.
- [x] Add MemoryReader agent/skill.
- [x] Add MemoryChecker agent/skill.
- [x] Update Queen workflow to call MemoryReader before planning.
- [x] Update Documenter workflow to call MemoryWriter after accepted artifacts.
- [x] Run MemoryChecker after validation/review milestones.
- [x] Create MemoryRepairTask when validation contradicts stored memory.

## Phase 6 - API And UI

- [x] Add `/api/memory/evidence-chain`.
- [x] Add `/api/memory/contradictions`.
- [x] Add `/api/memory/repairs`.
- [x] Add `/api/memory/timeline`.
- [x] Keep current flat memory list working.
- [ ] Add UI indicators for source, temporal validity, superseded state, and evidence links.

## Phase 7 - Validation

- [x] Unit test memory core fallback behavior when Neo4j is offline.
- [x] Unit test Qdrant/file fallback behavior.
- [ ] Integration test Neo4j + Graphiti episode write/read.
- [ ] Integration test migration idempotency.
- [ ] Verify RuFloUI still reports nonzero memory entries.
- [ ] Verify Qdrant collection remains intact.
- [ ] Verify Docker stack starts with Neo4j added.

## Phase 8 - Cutover Rules

- [x] Run Graphiti in shadow mode first.
- [x] Do not remove Qdrant primary paths until Graphiti migration is verified.
- [ ] Require a rollback note before making Graphiti authoritative.
- [ ] Update `Architecture.md`, `README.md`, and runbooks only after implementation matches docs.
