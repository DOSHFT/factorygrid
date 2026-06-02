# RuFlo Feature Audit - OFF / Degraded Checklist

Audit date: 2026-06-02  
Target UI: http://192.168.178.20:28589/  
Backend API: http://192.168.178.20:28580/api  
Runtime scope: WSL distro `revelation`, repo `D:\UAT\factorygrid`

## Evidence

- Route inventory: `workspace/ruflo-feature-audit-route-inventory.json`
- UI action sweep: `workspace/ruflo-feature-audit-actions.json`
- Missed/DOM evidence: `workspace/ruflo-feature-audit-missed-dom.json`
- Backend API probe: 50+ read/control endpoints returned HTTP 200, including fabric snapshot, vLLM models, work-order creation, swarm, agents, tasks, memory, sessions, hive mind, neural, performance, hooks, workflows, workspace, config, logs, and webhook routes.
- Route render check: all 19 sidebar routes rendered main content.

## Confirmed OFF / Degraded / Risk Items

| Area | Feature / control | Status | Evidence | RCA | Next fix |
|---|---|---:|---|---|---|
| Fabric | Degraded row `Work Order` button | DEGRADED UX | Browser click produced no visible row/panel state change. Backend creates files in container paths `/ui/workspace/work-orders/...` and `/factorygrid/rufloui/workspace/work-orders/...`, not in `D:\UAT\factorygrid\workspace`. | `FabricMonitorPanel.tsx` only writes a collapsed Recent Activity log after `api.fabric.updateWorkOrder('manual')`. Backend uses `process.cwd()` in `server.ts`, so artifact location depends on container cwd. | Show a toast/inline result, expose a link/path in Fabric UI, and write or mirror work orders into the repo workspace path expected by UAT. |
| Fabric | OpenHands support runtime yellow state | DEGRADED / EXPECTED-BUT-CONFUSING | Fabric shows `openhands-runtime-*` yellow: "Support runtime discovered from Docker." | `server.ts` classifies runtime containers discovered from Docker as support runtimes with yellow status, separate from primary OpenHands health. | Rename status to "support runtime observed" or show why yellow is not an actionable outage. |
| WebSocket | Console warning spam | DEGRADED | Console repeatedly logged `Unknown WS message type: connected`. | Backend sends `{ type: "connected" }` in `server.ts`; frontend `App.tsx` has no `case 'connected'` and falls to warning. | Add a no-op/health handling case for `connected`. |
| Agents | Spawn agent creates duplicate React key warning | OFF / DATA DUPLICATION RISK | After spawning the audit agent, console logged duplicate key for the same `agent-*` id. | Likely optimistic local insert plus backend/store refresh inserts the same agent id again. | Deduplicate agents by id in store updates and/or avoid double optimistic insert. |
| Agents | Status modal close | DEGRADED ACCESSIBILITY | Action sweep could open Status, but `Close` was not found by accessible/text button lookup. | Modal close control is not exposed as a labeled `Close` button in the tested DOM path. | Add explicit `aria-label="Close"` and/or visible Close button. |
| Swarm Monitor | Agent Output modal close | DEGRADED ACCESSIBILITY | `Output` opened; `Close` was not found by accessible/text lookup. | Output modal uses icon/overlay-style close path that the automation could not identify as `Close`. | Add explicit labeled close control. |
| Tasks | Create Task expand/form controls | DEGRADED ACCESSIBILITY | Sweep could not find semantic `Create Task`/`Expand` form controls; source shows `span` click target for expand. | `TasksPanel.tsx` uses clickable `<span>` for the form toggle instead of a button. | Convert form toggle to `<button>` with label and aria-expanded. |
| Memory | Store/search controls and row actions | DEGRADED ACCESSIBILITY | Sweep could not reliably find memory search/store fields and found multiple icon-only row buttons with empty accessible text. | Memory row action buttons are icon-only without labels; form controls are hard to target consistently. | Add labels/aria labels to expand/delete/search/store controls. |
| Webhooks | GitHub/GitLab `Send Test` creates real failed task | OFF | Test webhook created visible failed task `[test/webhook-test#0] Test webhook event`; task failed cloning `https://github.com/test/webhook-test.git` due no credentials/nonexistent test repo. | Test endpoint uses fake `test/webhook-test` payload and dispatches the real task/clone path instead of a dry-run/mock. | Make webhook test dry-run by default or mark generated task as synthetic and prevent real clone. |
| Webhooks | Tab style console warning | DEGRADED | React warned about mixing `borderBottom` shorthand and longhand style properties. | `WebhooksPanel.tsx` tab style sets both `borderBottom` and `borderBottomWidth/Style/Color`. | Use either shorthand or longhand, not both. |
| Workspace | Workspace tree exposes sensitive/runtime files | RISK | UI tree includes `.env`, backups, logs/runtime/storage folders, and other local artifacts. | Workspace tree backend/frontend do not filter secrets, backups, ignored folders, or runtime storage before display. | Add denylist/gitignore-aware filtering and hide secret-like files by default. |
| Workflows | Delete buttons | RISK | Many workflow `Delete` buttons are rendered; source calls `handleAction(wf.id, 'delete')` directly. | No confirmation guard was observed for workflow deletion. | Add confirmation modal and make delete secondary/destructive. |

## Not Fully Verified Because They Are Destructive Or Require Prepared Inputs

These were intentionally not executed against the live UAT stack:

- Swarm: confirm shutdown.
- Agents: terminate agent / terminate all agents.
- Swarm Monitor: purge all agents.
- Learning: run growth cycle.
- Hive Mind: shutdown, leave, broadcast, consensus with prepared live swarm context.
- Neural: actual training/prediction execution with valid model/data payloads.
- Workflows: execute, pause, resume, cancel, delete against live workflows.
- Sessions: restore/delete live sessions.
- Fabric: restart/start/reload/stop model and containers from UI.
- Logs: clear logs.

## Raw Sweep Notes

The UI action sweep recorded 116 attempted interactions: 76 pass, 30 fail, 10 skip. Several fail rows are harness-label misses, not product failures, and passed on exact-label retest:

- Performance: actual labels are `Run Benchmark`, `Detect Bottlenecks`, `Optimize`, `Generate Profile`, `Full Report`.
- Config Telegram test: actual label is `Send Test`.
- Logs auto-scroll: actual labels are `Auto-scroll ON` / `Auto-scroll OFF`.
- Hive Mind initialize: not present because Hive Mind was already active.

## Priority Fix Order

1. Fix Fabric Work Order visibility and artifact path.
2. Fix webhook test mode so it does not create real failed clone tasks.
3. Handle WebSocket `connected` messages.
4. Deduplicate spawned agents by id.
5. Add accessible labels/real buttons for modal close, task expand/create, memory row actions, and swarm monitor output.
6. Add workspace tree filtering for secrets/runtime artifacts.
7. Add workflow delete confirmation.
