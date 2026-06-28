# J.A.R.V.I.S. Integration

Source repo: `D:\Dev\Repos\Mark-XLVII`

FactoryGrid role: Windows-native J.A.R.V.I.S. operator surface for browser, desktop, file, audio, and system-control tasks on BlackBeast. Mark XLVII is the source runtime name only; operator-facing docs and Fabric should label it `J.A.R.V.I.S.`. It is not a model server. It must call the active FactoryGrid model through the Jarvis model self-heal contract when it needs local FactoryGrid agent work.

Installed runtime:

- Python venv: `D:\Dev\Repos\Mark-XLVII\.venv`
- Python version: 3.12
- Playwright Chromium installed
- Secret config: `D:\Dev\Repos\Mark-XLVII\config\api_keys.json`
- Example config: `D:\Dev\Repos\Mark-XLVII\config\api_keys.example.json`

Start commands:

```powershell
D:\UAT\factorygrid\bin\start-mark-xlvii.ps1
D:\UAT\factorygrid\bin\start-mark-xlvii.ps1 -Admin
```

The `-Admin` switch uses Windows `RunAs` so Jarvis receives an elevated token after the operator accepts UAC. This is required for admin-level desktop automation, file management, browser control, and Windows setting actions.

Windows startup:

```powershell
D:\UAT\factorygrid\bin\install-mark-xlvii-startup-task.ps1
```

This registers the scheduled task `FactoryGrid Mark XLVII Jarvis` with `RunLevel Highest` and an `AtLogOn` trigger. A scheduled task is used instead of a Windows service because Mark XLVII needs the interactive desktop session for PyQt, microphone/audio, browser control, and desktop automation. Services run in session 0 and are not reliable for that workload.

The launcher uses hidden PowerShell/python windows where possible and suppresses the noisy `sounddevice` NumPy deprecation warning with `PYTHONWARNINGS=ignore::DeprecationWarning:sounddevice`.

The launcher also exports FactoryGrid knowledge paths into the J.A.R.V.I.S. process:

```text
FACTORYGRID_ROOT=D:\UAT\factorygrid
FACTORYGRID_FACTORY_BRAIN=D:\UAT\factorygrid\workspace\factory-brain
FACTORYGRID_SPEC_KIT=D:\UAT\factorygrid\workspace\spec-kit
FACTORYGRID_OBSIDIAN_VAULT=D:\Knowledge\Kartpathy-Wiki
FACTORYGRID_MODEL_SELF_HEAL=D:\UAT\factorygrid\bin\jarvis-model-self-heal.ps1
```

For a one-shot path contract:

```powershell
D:\UAT\factorygrid\bin\jarvis-knowledge-context.ps1
```

Dashboard:

- LAN/local dashboard: `https://127.0.0.1:8000` and `https://192.168.178.20:8000` when Windows firewall allows it.
- Mark also opens TLS alias port `8001` when dashboard SSL is enabled.
- The dashboard has authenticated command, websocket, upload, and phone-audio routes.

Known BlackBeast startup gate:

- If `svchost.exe` owns `0.0.0.0:8000`, Mark cannot bind its dashboard. That is stale Windows `netsh interface portproxy` drift, not a Mark failure.
- Fix with elevated PowerShell:

```powershell
D:\UAT\factorygrid\bin\fix-mark-xlvii-portproxy.ps1
```

- Then start Mark again:

```powershell
D:\UAT\factorygrid\bin\start-mark-xlvii.ps1 -Admin
```

Model rule:

Mark XLVII's built-in Gemini Live path still needs `gemini_api_key`. FactoryGrid-local agent work must resolve the active local model by running:

```powershell
D:\UAT\factorygrid\bin\jarvis-model-self-heal.ps1
```

Use the returned `base_url` and `model`. The normal route is LiteLLM `4001` with alias `qwen-coder-14b`; vLLM `18000` is diagnostics and self-heal only.

## Knowledge And Memory Rule

J.A.R.V.I.S. may read both Factory Brain and the Obsidian/Kartpathy-Wiki vault to understand the operator's project context:

- Factory Brain: `D:\UAT\factorygrid\workspace\factory-brain`
- Obsidian vault: `D:\Knowledge\Kartpathy-Wiki`

Factory Brain remains authoritative. Obsidian is the human-facing knowledge mirror. Accepted decisions, lessons, specs, and validation results must be written back to Factory Brain/Spec Kit first, then mirrored or linked into Obsidian. Qdrant remains production recall. Neo4j/Graphiti remain shadow/future memory unless the memory runbook promotes them.

## FactoryGrid Tool

J.A.R.V.I.S. now has a direct FactoryGrid action module:

```text
D:\Dev\Repos\Mark-XLVII\actions\factorygrid.py
```

Registered tool name:

```text
factorygrid
```

Supported actions:

- `status`
- `search_memory`
- `create_intake`
- `create_matrix_intake`
- `create_task`
- `create_and_run_task`
- `open_factory`
- `open_fabric`
- `model_self_heal`

The default high-level flow is:

```text
J.A.R.V.I.S. -> RuFloUI /api/factory/intake -> Spec Kit / Factory Brain -> RuFloUI /api/tasks assignTo=swarm
```

`create_intake` and `create_matrix_intake` default to `auto_submit=true`, which creates a gated swarm task after the Spec Kit/Factory Brain artifacts are written. This is allowed because FactoryGrid gates still enforce research, provenance, protected-file review, model routing, and Factory Brain write-back.

Hermes `revelations-ruflo` MCP is still not production-reliable after the update and must pass `hermes mcp test` plus an end-to-end RuFlo write before agents rely on it. J.A.R.V.I.S. should use the RuFloUI API adapter as the stable path.
