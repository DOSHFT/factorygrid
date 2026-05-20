# RuFloUI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser UI for viewing and operating RuFlo agents, swarms, tasks, memory, and daemon state in the Revelation factory stack.

**Architecture:** Run Mario-PB/RuFloUI as a separate Docker Compose service. Keep UI source and Node dependencies isolated in `./rufloui`, while mounting the live RuFlo project at `/workspace` and forcing CLI calls to execute there with `RUFLO_CWD`.

**Tech Stack:** Docker Compose, Node 20, React/Vite frontend, Express/WebSocket backend, RuFlo CLI via `npx ruflo@latest`.

---

### Task 1: Install RuFloUI Source

**Files:**
- Create: `/home/revelation/factorygrid/rufloui`

- [x] Clone `https://github.com/Mario-PB/RuFloUI.git` into `/home/revelation/factorygrid/rufloui`.

### Task 2: Patch Backend CLI Working Directory

**Files:**
- Modify: `/home/revelation/factorygrid/rufloui/src/backend/server.ts`

- [x] Add `RUFLO_CWD` support so UI backend CLI calls run against `/workspace`, not the UI app directory.
- [x] Set spawned-agent timestamp mapping to match RuFlo's UTC 12-hour table output so friendly names persist in the Agents page.

### Task 3: Add Compose Service

**Files:**
- Modify: `/home/revelation/factorygrid/docker-compose.yml`

- [x] Add `rufloui` service on ports `28588` and `28580`.
- [x] Mount `./rufloui:/ui` and `./ruflo_project:/workspace`.
- [x] Set `RUFLO_CLI=npx -y ruflo@latest`, `RUFLO_CWD=/workspace`, and LiteLLM env.

### Task 4: Start And Verify

**Files:**
- Runtime only

- [x] Start the new service with `docker compose up -d rufloui`.
- [x] Verify backend API, frontend HTTP response, container logs, and one visible named agent.
