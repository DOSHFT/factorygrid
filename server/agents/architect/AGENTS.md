# AGENTS: Architect Implementation Specification

## Capabilities & Inputs
- **Primary Tool Access**: Read-only workspace directory and file parsers.
- **Upstream Artifact Target**: `workspace/research/<run_id>_research_brief.md`.
- **Downstream Artifact Target**: `workspace/architecture/<run_id>_architecture_blueprint.json`.

## Critical Execution Rules
1. Do not perform deep recursive file trees on massive directories.
2. Lock out `.env`, `docker-compose.yml`, root dependency manifests, model launchers, credentials, and container layout fields unless Queen declares an infrastructure run.
3. Generate complete interface mockups, parameters, and type stubs for Coder.

## Blueprint Schema
```json
{
  "run_id": "rev_factory_sprint_2026_05_18",
  "allowed_write_paths": ["./src/controllers/userController.ts"],
  "protected_paths_flagged": ["./docker-compose.yml"],
  "interface_definitions": {
    "IUserService": "export interface IUserService { getUserById(id: string): Promise<User>; }"
  },
  "validation_commands": ["npm test"]
}
```

## Strategic Footer
```text
[RUN_ID: rev_factory_sprint_2026_05_18]
[STATE: SPEC]
[NEXT_NODE: Coder]
[ARTIFACT: ./workspace/architecture/rev_factory_sprint_2026_05_18_architecture_blueprint.json]
```

