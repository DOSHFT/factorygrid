# FactoryGrid Component Update Review

Generated: 2026-05-26T21:09:09.707Z
Reason: startup
Status: report-only

## Classification Counts
- critical value: 8
- medium value: 13
- no value: 9

## Supervisor Rule
No component update may be implemented until a snapshot and rollback plan is approved by Queen.

## Findings
| Component | Current | Available | Classification | Reason |
| --- | --- | --- | --- | --- |
| npm:@types/node | 22.19.15 | 25.9.1 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:@vitejs/plugin-react | 4.7.0 | 6.0.2 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:eslint | 9.39.3 | 10.4.0 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:express | 4.22.1 | 5.2.1 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:jsdom | 28.1.0 | 29.1.1 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:lucide-react | 0.468.0 | 1.16.0 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:recharts | 2.15.4 | 3.8.1 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| npm:typescript | 5.7.0 | 6.0.3 | critical value | Major update available; likely important but requires rollback plan and compatibility review. |
| docker:litellm | ghcr.io/berriai/litellm@sha256:7c311546c25e7bb6e8cafede9fcd3d0d622ac636b5c9418befaa32e85dfb0186 | upstream release check required | medium value | External container image should be reviewed against upstream release notes before pulling. |
| docker:neo4j | neo4j:5.26-community | upstream release check required | medium value | External container image should be reviewed against upstream release notes before pulling. |
| docker:openhands_engineer | ghcr.io/all-hands-ai/openhands@sha256:00968de77a7b36546413e1f3b5c6b4e2c387d19ade54de7926e10f5b3d265fa6 | upstream release check required | medium value | External container image should be reviewed against upstream release notes before pulling. |
| docker:qdrant | qdrant/qdrant@sha256:b3063c673f3973877c038eeecc392bad5011f072ee7892b56c9a8e204a3bdea9 | upstream release check required | medium value | External container image should be reviewed against upstream release notes before pulling. |
| docker:qwen_code_worker | node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 | upstream release check required | medium value | External container image should be reviewed against upstream release notes before pulling. |
| npm:@claude-flow/cli | 3.5.15 | 3.10.3 | medium value | Minor update available; likely useful after changelog review. |
| npm:@react-three/fiber | 9.5.0 | 9.6.1 | medium value | Minor update available; likely useful after changelog review. |
| npm:react | 19.0.0 | 19.2.6 | medium value | Minor update available; likely useful after changelog review. |
| npm:react-router-dom | 7.13.1 | 7.15.1 | medium value | Minor update available; likely useful after changelog review. |
| npm:ruflo | 3.7.0-alpha.44 | 3.10.3 | medium value | Minor update available; likely useful after changelog review. |
| npm:three | 0.183.2 | 0.184.0 | medium value | Minor update available; likely useful after changelog review. |
| npm:tsx | 4.21.0 | 4.22.3 | medium value | Minor update available; likely useful after changelog review. |
| npm:ws | 8.20.1 | 8.21.0 | medium value | Minor update available; likely useful after changelog review. |
| docker:ruflo_orchestrator | factorygrid/ruflo:3.7.0-alpha.44 | upstream release check required | no value | Local FactoryGrid image; update value depends on local source changes, not upstream pull. |
| docker:rufloui | factorygrid/rufloui:0.3.45-local | upstream release check required | no value | Local FactoryGrid image; update value depends on local source changes, not upstream pull. |
| npm:@types/react | 19.2.14 | 19.2.15 | no value | Patch update only; usually low value unless it includes a security or stability fix. |
| npm:node-telegram-bot-api | 0.67.0 | 0.67.0 | no value | No actionable version delta was found. |
| npm:react-dom | 19.2.4 | 19.2.6 | no value | Patch update only; usually low value unless it includes a security or stability fix. |
| npm:vite | 8.0.13 | 8.0.14 | no value | Patch update only; usually low value unless it includes a security or stability fix. |
| npm:vitest | 4.1.6 | 4.1.7 | no value | Patch update only; usually low value unless it includes a security or stability fix. |
| npm:zustand | 5.0.11 | 5.0.13 | no value | Patch update only; usually low value unless it includes a security or stability fix. |
| runtime:node | 20.20.2 | 20.20.2 | no value | No actionable version delta was found. |

## Rollback Plan Required Before Implementation
- Git commit or branch containing the exact version changes.
- Docker image tags/digests recorded before pull/build.
- Compose file and environment diff captured.
- Qdrant storage snapshot or backup plan.
- vLLM model/startup rollback command.
- Explicit Queen approval for any medium or critical value update.

## Raw Docker Images
```
litellm ghcr.io/berriai/litellm@sha256:7c311546c25e7bb6e8cafede9fcd3d0d622ac636b5c9418befaa32e85dfb0186 Created
neo4j neo4j:5.26-community Up 33 minutes (healthy)
openhands_engineer ghcr.io/all-hands-ai/openhands@sha256:00968de77a7b36546413e1f3b5c6b4e2c387d19ade54de7926e10f5b3d265fa6 Created
qdrant qdrant/qdrant@sha256:b3063c673f3973877c038eeecc392bad5011f072ee7892b56c9a8e204a3bdea9 Created
qwen_code_worker node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 Created
ruflo_orchestrator factorygrid/ruflo:3.7.0-alpha.44 Created
rufloui factorygrid/rufloui:0.3.45-local Created
```

## Raw npm outdated
```json
{
  "@claude-flow/cli": {
    "current": "3.6.30",
    "wanted": "3.10.3",
    "latest": "3.10.3",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/@claude-flow/cli"
  },
  "@react-three/fiber": {
    "current": "9.5.0",
    "wanted": "9.6.1",
    "latest": "9.6.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/@react-three/fiber"
  },
  "@types/node": {
    "current": "22.19.15",
    "wanted": "22.19.19",
    "latest": "25.9.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/@types/node"
  },
  "@types/react": {
    "current": "19.2.14",
    "wanted": "19.2.15",
    "latest": "19.2.15",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/@types/react"
  },
  "@vitejs/plugin-react": {
    "current": "4.7.0",
    "wanted": "4.7.0",
    "latest": "6.0.2",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/@vitejs/plugin-react"
  },
  "eslint": {
    "current": "9.39.3",
    "wanted": "9.39.4",
    "latest": "10.4.0",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/eslint"
  },
  "express": {
    "current": "4.22.1",
    "wanted": "4.22.2",
    "latest": "5.2.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/express"
  },
  "jsdom": {
    "current": "28.1.0",
    "wanted": "28.1.0",
    "latest": "29.1.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/jsdom"
  },
  "lucide-react": {
    "current": "0.468.0",
    "wanted": "0.468.0",
    "latest": "1.16.0",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/lucide-react"
  },
  "react": {
    "current": "19.2.4",
    "wanted": "19.2.6",
    "latest": "19.2.6",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/react"
  },
  "react-dom": {
    "current": "19.2.4",
    "wanted": "19.2.6",
    "latest": "19.2.6",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/react-dom"
  },
  "react-router-dom": {
    "current": "7.13.1",
    "wanted": "7.15.1",
    "latest": "7.15.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/react-router-dom"
  },
  "recharts": {
    "current": "2.15.4",
    "wanted": "2.15.4",
    "latest": "3.8.1",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/recharts"
  },
  "ruflo": {
    "current": "3.7.0-alpha.69",
    "wanted": "3.10.3",
    "latest": "3.10.3",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/ruflo"
  },
  "three": {
    "current": "0.183.2",
    "wanted": "0.183.2",
    "latest": "0.184.0",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/three"
  },
  "tsx": {
    "current": "4.21.0",
    "wanted": "4.22.3",
    "latest": "4.22.3",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/tsx"
  },
  "typescript": {
    "current": "5.9.3",
    "wanted": "5.9.3",
    "latest": "6.0.3",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/typescript"
  },
  "vite": {
    "current": "8.0.13",
    "wanted": "8.0.14",
    "latest": "8.0.14",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/vite"
  },
  "vitest": {
    "current": "4.1.6",
    "wanted": "4.1.7",
    "latest": "4.1.7",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/vitest"
  },
  "ws": {
    "current": "8.20.1",
    "wanted": "8.21.0",
    "latest": "8.21.0",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/ws"
  },
  "zustand": {
    "current": "5.0.11",
    "wanted": "5.0.13",
    "latest": "5.0.13",
    "dependent": "rufloui",
    "location": "/factorygrid/rufloui/node_modules/zustand"
  }
}
```

## Notes
- none
