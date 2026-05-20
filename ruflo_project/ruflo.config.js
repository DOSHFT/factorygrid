module.exports = {
  project: "FactoryGrid Software Engine",
  topology: "hierarchical", // Master Queen orchestrating distinct execution branches
  maxAgents: 11,
  context: {
    maxModelLen: 32768,
    policy: "context-pack-first",
    packPath: "/home/revelation/factorygrid/workspace/.factory-snapshots/${run_id}/context-pack.md",
    evidenceRequired: true
  },
  safety: {
    yoloMode: true,
    snapshotRequiredBeforeWrites: true,
    snapshotHook: "/home/revelation/factorygrid/server/hooks/pre_work_snapshot.sh",
    architectureGate: "/home/revelation/factorygrid/server/hooks/gate_architecture.py",
    diffScopeGate: "/home/revelation/factorygrid/server/hooks/gate_diff_scope.py",
    validationGate: "/home/revelation/factorygrid/server/hooks/gate_validation.py",
    reviewGate: "/home/revelation/factorygrid/server/hooks/gate_review.py",
    exportCoverageGate: "/home/revelation/factorygrid/server/hooks/gate_export_coverage.py",
    productionUpdateRequiresExportCoverage: true,
    protectedFileGate: true,
    protectedFileCheck: "/home/revelation/factorygrid/bin/check-protected-edits.sh",
    maxCorrectionCycles: 3,
    openHandsMaxIterations: 40
  },
  contracts: {
    root: "/home/revelation/factorygrid/server/agents",
    capabilityMatrix: "/home/revelation/factorygrid/docs/agents/capability_matrix.md",
    orchestrationMatrix: "/home/revelation/factorygrid/docs/agents/deployment_orchestration.md"
  },
  memory: {
    provider: "qdrant",
    url: process.env.QDRANT_URL || "http://factory_qdrant:6333",
    collections: {
      context: "factory_context_index",
      research: "factory_research_sources",
      runs: "factory_run_artifacts"
    }
  },
  router: {
    api_base: process.env.OPENAI_API_BASE || "http://litellm:4000/v1",
    default_model: "qwen-coder-14b",
    reasoning_model: "qwen-coder-14b" // Stable single-model factory mode; add architect model when endpoint exists
  },
  agents: [
    {
      name: "Queen",
      role: "Orchestrator",
      contract: "/home/revelation/factorygrid/server/agents/queen",
      system: "Own the task state machine. Convert rough user goals into task_manifest.json, assign worker nodes, require artifacts at every state transition, and never write code directly. For UAT/PROD environment updates, require gate_export_coverage.py and factory-secure-backup.sh before declaring production-ready."
    },
    {
      name: "Architect",
      role: "System Designer",
      contract: "/home/revelation/factorygrid/server/agents/architect",
      system: "Map the target file tree with minimal reads, emit architecture_blueprint.json, enforce allowed write paths, and trigger a protected-file gate before config or dependency edits.",
      model: "qwen-coder-14b"
    },
    {
      name: "Researcher",
      role: "Research and Provenance",
      contract: "/home/revelation/factorygrid/server/agents/researcher",
      system: "Use Tavily for quick search and Firecrawl when configured for deep extraction. Produce research_brief.md and source_manifest.json with URLs, fetch times, and content hashes.",
      model: "qwen-coder-14b"
    },
    {
      name: "Coder",
      role: "Feature Implementer",
      contract: "/home/revelation/factorygrid/server/agents/coder",
      system: "Implement only the Architect-approved write paths, follow local patterns, and keep diffs small and attributable.",
      model: "qwen-coder-14b"
    },
    {
      name: "Tester",
      role: "Validation",
      contract: "/home/revelation/factorygrid/server/agents/tester",
      system: "Run declared validation commands and produce validation_report.md with command, exit code, and key output.",
      model: "qwen-coder-14b"
    },
    {
      name: "Reviewer",
      role: "Safety and Code Review",
      contract: "/home/revelation/factorygrid/server/agents/reviewer",
      system: "Review diffs for bugs, unsafe edits, missing tests, runaway tool loops, and unbounded autonomy before ship.",
      model: "qwen-coder-14b"
    },
    {
      name: "Documenter",
      role: "Durable Documentation",
      contract: "/home/revelation/factorygrid/server/agents/documenter",
      system: "Write handoff_summary.md and update durable docs when runtime contracts change. Store only provenance-rich memories. When files, products, hooks, scripts, runtime paths, or deployment artifacts change, update docs/runbooks/FACTORY_EXPORT_COVERAGE.md and verify gate_export_coverage.py.",
      model: "qwen-coder-14b"
    },

    {
      name: "Technology-Strategist",
      role: "Adversarial Technology Selection",
      contract: "/home/revelation/factorygrid/server/agents/technology-strategist",
      system: "Challenge proposed stacks, compare alternatives, document reversal triggers, and block DEV until the technology-choice gate passes.",
      model: "qwen-coder-14b"
    },
    {
      name: "GitHub-Risk-Scout",
      role: "Upstream Failure Intelligence",
      contract: "/home/revelation/factorygrid/server/agents/github-risk-scout",
      system: "Mine upstream repositories and issue trackers for setup, protocol, performance, reconnect, dictionary, and compatibility risks before implementation.",
      model: "qwen-coder-14b"
    },
    {
      name: "Performance-Engineer",
      role: "Latency and Throughput Validation",
      contract: "/home/revelation/factorygrid/server/agents/performance-engineer",
      system: "Define and enforce connector harnesses, p50/p95/p99 latency, throughput, allocation, backpressure, and soak-test requirements.",
      model: "qwen-coder-14b"
    },
    {
      name: "Blue-Team-CELL",
      role: "Defensive Cellular Security Research",
      contract: "/home/revelation/factorygrid/server/agents/blue-team-cell",
      system: "Build lab-only blue-team cellular security briefs, threat models, detection/control matrices, and validation plans from 2G/GSM through 5G/O-RAN and early 6G research. Refuse live-network abuse, interception, jamming, subscriber capture, and unauthorized RF activity.",
      model: "qwen-coder-14b"
    }
  ]
};
