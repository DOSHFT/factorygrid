# Jarvis RuFloUI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct J.A.R.V.I.S. tool that creates FactoryGrid Spec Kit intakes and swarm tasks through the RuFloUI API.

**Architecture:** Keep J.A.R.V.I.S. upgradeable by adding one isolated Mark XLVII action module plus one tool declaration/dispatcher hook. The adapter calls RuFloUI HTTP APIs and leaves Hermes/MCP as optional future providers.

**Tech Stack:** Python 3.12, `requests`, Mark XLVII Gemini function tools, RuFloUI `/api/factory` and `/api/tasks`.

---

### Task 1: FactoryGrid Action

**Files:**
- Create: `D:\Dev\Repos\Mark-XLVII\actions\factorygrid.py`
- Test: `D:\Dev\Repos\Mark-XLVII\tests\test_factorygrid.py`

- [x] Create a focused action module that discovers the RuFloUI base URL, creates Spec Kit intakes, creates matrix intakes, searches Factory Brain, opens Factory/Fabric URLs, runs model self-heal, and can auto-submit a gated swarm task.
- [x] Add unit tests for request construction and auto-submit behavior without hitting the live network.

### Task 2: Jarvis Tool Registration

**Files:**
- Modify: `D:\Dev\Repos\Mark-XLVII\main.py`

- [x] Import the new `factorygrid` action.
- [x] Add a `factorygrid` Gemini function declaration.
- [x] Dispatch `factorygrid` tool calls through the existing executor.

### Task 3: Documentation And Checklist

**Files:**
- Create: `D:\UAT\factorygrid\docs\integrations\jarvis-integration.md`
- Modify: `D:\UAT\factorygrid\todo-factory.md`
- Modify: `D:\UAT\factorygrid\docs\integrations\MARK_XLVII_JARVIS.md`

- [x] Track implemented and pending capabilities in `jarvis-integration.md`.
- [x] Update FactoryGrid todo/docs once the adapter is verified.

### Verification

- [x] `python -m unittest discover -s tests`
- [x] `python -m py_compile main.py actions/factorygrid.py`
- [x] Sync FactoryGrid docs to Revelation live copy.
