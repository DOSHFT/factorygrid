# Local Model Path RCA

Date: 2026-06-06

## Symptoms

- Swarm task "Check Codebase for Vulnerabilities" failed with:
  `Task model path unavailable at http://litellm:4000/v1/chat/completions using model qwen-coder-14b`.
- Hermes was configured for FactoryGrid LiteLLM, but task agents still failed.
- `http://192.168.178.20:28589` stopped responding.

## Root Causes

1. vLLM had died after a CUDA unknown error. LiteLLM still listed configured models, but completions returned 500 until vLLM was restarted on port 18000.
2. RuFloUI had stale runtime credentials. LiteLLM expected the active FactoryGrid key used by Hermes.
3. A failed compose recreate temporarily left `factory_litellm` detached/created instead of healthy on `factorygrid_factory_net`, breaking the internal `litellm` DNS route from RuFloUI.
4. The old LAN URL used `192.168.178.20`, but Windows currently owns `192.168.178.179`. The stack was healthy on the current host IP.

## Fixed State

- vLLM listens on `0.0.0.0:18000`.
- LiteLLM listens on `127.0.0.1:4000` and `0.0.0.0:4001`, with Docker alias `litellm`.
- RuFloUI uses `OPENAI_API_BASE=http://litellm:4000/v1`.
- RuFloUI uses the same `sk-*` FactoryGrid API key as Hermes.
- Swarm vulnerability audit tasks complete through the local fallback when Claude Code CLI is unavailable.

## Prevention

- Treat `/v1/models` as insufficient; always test `/v1/chat/completions`.
- Keep `FACTORY_API_KEY` aligned with Hermes `FACTORYGRID_API_KEY`.
- Recreate RuFloUI with `--no-deps` when only task-agent env changes are needed.
- If compose touches LiteLLM, verify it is healthy and attached to `factorygrid_factory_net` with aliases `litellm` and `factory_litellm`.
- Do not hardcode LAN IPs in runbooks or screenshots; verify current Windows LAN IP before using external URLs.

## Workspace Yellow Icons

The small yellow squares in the Workspace file tree are git status badges. In `rufloui/src/frontend/pages/WorkspacePanel.tsx`, yellow means `modified`; blue means `created`; red means `deleted`; green means `untracked`. They are not separate warnings and do not open a deeper explanation.
