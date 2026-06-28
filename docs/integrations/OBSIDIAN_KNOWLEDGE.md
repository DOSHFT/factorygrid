# Obsidian / Kartpathy-Wiki Knowledge Contract

Vault:

```text
D:\Knowledge\Kartpathy-Wiki
/mnt/d/Knowledge/Kartpathy-Wiki
```

FactoryGrid uses this vault as the operator-readable knowledge surface for J.A.R.V.I.S., Claude Code/CLI, and Hermes. It is useful for curated notes, project context, architecture history, decisions, and research trails.

It is not the authoritative memory database.

Authority order:

1. Factory Brain: `D:\UAT\factorygrid\workspace\factory-brain`
2. Qdrant: production recall and similarity search
3. Neo4j: shadow graph store
4. Graphiti/SAGE-style memory: future promotion path after activation gates
5. Obsidian/Kartpathy-Wiki: human-readable mirror and operator workspace

Agent rule:

- Search Factory Brain first.
- Search Obsidian for human-curated context when the task depends on project history, architecture, operator preferences, or prior research.
- Extract exact relevant snippets and file links; do not flood prompts with whole vault pages.
- Write accepted lessons, decisions, specs, and validation results back through Factory Brain or Spec Kit before mirroring them into Obsidian.
- If Obsidian contradicts Factory Brain, create a memory repair task instead of silently choosing one.

J.A.R.V.I.S. receives the vault path through `FACTORYGRID_OBSIDIAN_VAULT` from `bin\start-mark-xlvii.ps1`.

Claude Code/CLI should treat this file plus `CLAUDE.md` as the current memory contract.
