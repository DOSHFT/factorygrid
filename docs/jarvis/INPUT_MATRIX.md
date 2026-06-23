# Jarvis Input Matrix (Spec-Kit Type)

**Purpose**: Rich, structured input for Jarvis (unified verbal front-end) that feeds the full FactoryGrid lifecycle (Research → Development → Production/Release). Extends the thin `SpecKitIntakeInput` (title + vision) into a complete context-engineering contract.

This matrix is produced by the Planning Agent after interactive clarification on a verbal goal. It becomes the durable `_request.md` + project item that Queen/agents use with gates, propose/review loops, and provenance.

## Matrix Schema (TS + Markdown)

```ts
interface JarvisInputMatrix {
  // Core
  title: string;
  vision: string;                    // raw verbal + normalized
  endGoal?: string;                   // measurable outcome

  // Constraints & Platforms
  platforms?: string[];               // e.g. ["iOS", "GrapheneOS Pixel 8+"]
  hardConstraints?: string[];
  env?: string;                       // factory bounds if applicable

  // Requirements
  functional?: string[];
  successCriteria?: string;           // with metrics
  nonFunctional?: string[];

  // Security / Threat (mandatory for ambitious goals)
  threatModel?: string;               // e.g. "device capture = full FS + RAM + network adversary; no plaintext ever on disk"
  securityProperties?: string[];      // forward secrecy, memory-only, enclave, deniability, ...
  adversaryCapabilities?: string[];
  validationEvidenceNeeded?: string[]; // formal proofs, red-team, reproducible build audit, ...

  // Execution Context (drives Queen + model + memory)
  requestedMode?: 'PLAN' | 'DEV' | 'UAT' | 'PROD';
  recommendedModelProfile?: string;  // qwen-coder-awq-daily | batch | redteam-... | none
  memoryNamespaces?: string[];        // research:*, security:*, consensus:*
  allowedWritePrefixes?: string[];
  requiredEvidenceSources?: string[];

  // Process / Provenance
  assumptions?: string[];
  openQuestions?: string[];           // populated/filled by planning agent
  validationCommands?: string[];
  rollbackPlan?: string;
  sourceVerbal?: string;
  clarificationTurns?: number;
  relatedBrainPages?: string[];
}
```

## Markdown Template (for _request.md)

```markdown
# Jarvis Matrix / Spec-Kit Request: <run_id>

## Core
- **Title**: ...
- **Vision** (user words): ...
- **End Goal**: ...

## Constraints & Platforms
- Platforms: ...
- Hard constraints: ...
- Env: ...

## Requirements
- Functional: ...
- Success criteria (measurable): ...
- Non-functional: ...

## Security / Threat Model
- Threat model: ...
- Required security properties: ...
- Adversary capabilities considered: ...
- Validation evidence needed: ...

## Execution Context
- Mode: ...
- Recommended model profile: ...
- Memory namespaces: ...
- Allowed writes: ...
- Evidence sources: ...

## Process
- Assumptions: ...
- Open questions (from planner): ...
- Validation commands: ...
- Rollback plan: ...

## Provenance
- Source verbal: "..."
- Clarification turns: N
- Related: workspace/factory-brain/...
```

## Example: GrapheneOS Secure 1-1 Messenger (after planning agent)

(Abbreviated — full version produced by agent dialogue.)

Vision: Build absolute secure 1-1 comms app installable on iPhone + Pixel 8+ GrapheneOS so that even full device capture yields no messages.

Matrix highlights:
- Platforms: iOS (secure enclave, app sandbox), GrapheneOS (hardened Linux, verified boot, no Google).
- Threat: Physical capture + full FS/RAM access + network adversary; no persistent plaintext.
- Security props: E2EE with forward secrecy, keys in enclave/TEE only, memory-only decrypt buffers, deniable, no cloud unless user self-hosts relay (optional), reproducible builds.
- Hard: No central server by default; local storage never contains plaintext; open source; audit-friendly.
- Success: Capture of powered-off or running phone + full dump yields zero readable history. Red-team + formal model of key lifecycle.
- Evidence: reproducible build hash, key rotation logs, memory forensics report, GrapheneOS compatibility matrix.
- Recommended profile: research-heavy first (daily or none for pure planning), then dev.
- Namespaces: research:secure-comm, security:threat-model, consensus:review.

## Usage in Stack
- Planning agent (in Jarvis or Hermes) fills via dialogue.
- On approve → `createSpecKitIntake` (extended) + matrix.json + _request.md.
- Queen INTAKE consumes matrix for phase routing + gates.
- Research phase must satisfy threat + evidence sections before advancing.
- Release phase validates the securityProperties list.

## Evolution
Start minimal (extend current vision form). Add domain templates (secure-messaging, mobile-app, agent-tool). Integrate with context pack emission at creation.

See also:
- docs/context-engineering.md (packs)
- docs/jarvis/STACK_LIFECYCLE_CHECKLIST.md (phases)
- factory-brain.ts / server.ts intake
- server/agents/queen + planner
- Architecture.md product/release boundary
