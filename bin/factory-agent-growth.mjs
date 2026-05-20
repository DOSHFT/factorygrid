#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const root = process.env.FACTORYGRID_ROOT || process.cwd()
const qdrantUrl = process.env.QDRANT_URL || 'http://qdrant:6333'
const now = new Date().toISOString()
const date = now.slice(0, 10)
const stateFile = path.join(root, 'workspace', '.factory-agent-growth-seeded.json')
const collection = process.env.FACTORY_MEMORY_COLLECTION || 'factory_memory'
const vectorSize = 64
const maxEmbedChars = Number(process.env.MAX_FILE_EMBED_CHARS || 8000)

const agents = {
  queen: {
    mission: 'orchestration, task routing, mode gates, and multi-agent operating discipline',
    repos: [
      ['github/spec-kit', 'Spec-driven development workflow and living implementation contracts'],
      ['ruvnet/ruflo', 'MCP-first orchestration and graph-oriented agent UX'],
      ['ruvnet/sparc-ide', 'Artifact-centric software-factory workflow patterns'],
      ['All-Hands-AI/OpenHands', 'Autonomous coding runtime and sandbox execution model'],
      ['openai/openai-agents-python', 'Agent handoff, tools, tracing, and guardrail patterns'],
      ['microsoft/autogen', 'Conversable multi-agent orchestration patterns'],
      ['crewAIInc/crewAI', 'Role-based crew/task orchestration patterns'],
      ['langchain-ai/langgraph', 'Stateful agent graph execution patterns'],
      ['modelcontextprotocol/modelcontextprotocol', 'Tool interoperability protocol foundation'],
      ['ruvnet/federated-mcp', 'Future tool federation and multi-node MCP routing'],
    ],
  },
  researcher: {
    mission: 'current-source research, evidence capture, web ingestion, and context distillation',
    repos: [
      ['firecrawl/firecrawl', 'Web crawling and content extraction for research briefs'],
      ['scrapy/scrapy', 'Mature crawler architecture and extraction patterns'],
      ['tavily-ai/tavily-python', 'Search API client patterns for agent research'],
      ['jina-ai/reader', 'Reader-style web extraction and grounding'],
      ['run-llama/llama_index', 'Document ingestion and retrieval workflows'],
      ['deepset-ai/haystack', 'Search and retrieval application patterns'],
      ['qdrant/qdrant', 'Vector memory search and HNSW operational behavior'],
      ['microsoft/markitdown', 'Office/PDF/HTML to markdown conversion'],
      ['browserbase/stagehand', 'Browser automation for structured research'],
      ['unclecode/crawl4ai', 'LLM-friendly crawling and extraction patterns'],
    ],
  },
  architect: {
    mission: 'bounded topology, interface contracts, dependency maps, and path safety',
    repos: [
      ['github/spec-kit', 'Spec-to-plan architecture boundary model'],
      ['C4-PlantUML/C4-PlantUML', 'Architecture diagram notation and component boundaries'],
      ['plantuml/plantuml', 'Durable architecture diagrams'],
      ['mermaid-js/mermaid', 'Readable graph output for operator review'],
      ['openapi-ts/openapi-typescript', 'Typed API contract generation'],
      ['asyncapi/spec', 'Event-driven interface specification'],
      ['TNG/ArchUnit', 'Architecture rule testing patterns'],
      ['infracost/infracost', 'Infrastructure impact modeling'],
      ['aquasecurity/trivy', 'Config and dependency risk scanning'],
      ['tenable/terrascan', 'IaC policy and guardrail examples'],
    ],
  },
  coder: {
    mission: 'scoped implementation, idiomatic code synthesis, and local runtime fixes',
    repos: [
      ['All-Hands-AI/OpenHands', 'Autonomous code execution environment'],
      ['QwenLM/Qwen2.5-Coder', 'Stable local coding model family'],
      ['QwenLM/qwen-code', 'Qwen-oriented code-agent CLI patterns'],
      ['Aider-AI/aider', 'Repo-aware pair programming and patch workflow'],
      ['continuedev/continue', 'Local coding assistant integration patterns'],
      ['cline/cline', 'Tool-using coding agent UX and safety model'],
      ['RooVetGit/Roo-Code', 'Agent coding workflow patterns'],
      ['openai/codex', 'Codex CLI and local automation workflow patterns'],
      ['sst/opencode', 'Terminal-native coding agent ergonomics'],
      ['sourcegraph/cody', 'Codebase context and agentic coding references'],
    ],
  },
  tester: {
    mission: 'empirical validation, regression detection, benchmark discipline, and logs',
    repos: [
      ['microsoft/playwright', 'Browser and UI integration testing'],
      ['vitest-dev/vitest', 'Fast TS/JS unit testing'],
      ['pytest-dev/pytest', 'Python test orchestration'],
      ['SeleniumHQ/selenium', 'Cross-browser test automation'],
      ['grafana/k6', 'Load and performance testing'],
      ['locustio/locust', 'Python load-test scenarios'],
      ['junit-team/junit5', 'Java test conventions and reporting'],
      ['getsentry/sentry', 'Runtime error capture patterns'],
      ['allure-framework/allure2', 'Test reporting and evidence formatting'],
      ['testcontainers/testcontainers-node', 'Container-scoped integration testing'],
    ],
  },
  reviewer: {
    mission: 'security review, diff policing, dependency risk, and regression gates',
    repos: [
      ['semgrep/semgrep', 'Static analysis rules and custom policy checks'],
      ['github/codeql', 'Semantic code analysis and query packs'],
      ['aquasecurity/trivy', 'Container, dependency, and config vulnerability scanning'],
      ['gitleaks/gitleaks', 'Secret scanning'],
      ['trufflesecurity/trufflehog', 'Secret discovery and verification'],
      ['OWASP/Dependency-Check', 'Dependency vulnerability analysis'],
      ['owasp-dep-scan/dep-scan', 'Software composition analysis'],
      ['zaproxy/zaproxy', 'Web app dynamic security testing'],
      ['sonarsource/sonarqube', 'Code quality and security gate patterns'],
      ['pmd/pmd', 'Static code rule engine examples'],
    ],
  },
  documenter: {
    mission: 'handoff summaries, memory triplets, docs drift control, and operator runbooks',
    repos: [
      ['mkdocs/mkdocs', 'Static technical documentation'],
      ['squidfunk/mkdocs-material', 'Readable engineering docs UX'],
      ['facebook/docusaurus', 'Versioned docs and knowledge sites'],
      ['mintlify/starter', 'API/docs authoring patterns'],
      ['microsoft/markitdown', 'Artifact to markdown conversion'],
      ['mermaid-js/mermaid', 'Docs-native workflow diagrams'],
      ['plantuml/plantuml', 'Architecture diagrams in docs'],
      ['quarto-dev/quarto-cli', 'Research report generation'],
      ['docmost/docmost', 'Self-hosted knowledge-base patterns'],
      ['outline/outline', 'Team knowledge management patterns'],
    ],
  },
  'blue-team-cell': {
    mission: 'defensive cellular security, 5G/O-RAN lab validation, and legacy GSM risk mapping',
    repos: [
      ['open5gs/open5gs', '5G/LTE core network lab foundation'],
      ['aligungr/UERANSIM', '5G UE/RAN simulator for defensive lab validation'],
      ['OPENAIRINTERFACE/openairinterface5g', 'Open-source 5G RAN and core research stack'],
      ['srsran/srsRAN_Project', '5G RAN lab and monitoring foundation'],
      ['srsran/srsRAN_4G', 'LTE/4G lab interoperability reference'],
      ['osmocom/osmo-bsc', 'GSM BSC reference for legacy defensive modeling'],
      ['osmocom/osmo-msc', 'GSM MSC reference for legacy defensive modeling'],
      ['osmocom/gr-gsm', 'GSM signal analysis reference for lab-only detection work'],
      ['Orange-OpenSource/towards5gs-helm', 'Kubernetes 5G lab deployment patterns'],
      ['free5gc/free5gc', '5G core network research and defensive validation'],
    ],
  },
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeIfChanged(file, data) {
  mkdirp(path.dirname(file))
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === data) return false
  fs.writeFileSync(file, data)
  return true
}

function repoMarkdown(repos) {
  return repos.map(([repo, value], index) => `${index + 1}. [${repo}](https://github.com/${repo}) - ${value}`).join('\n')
}

function agentBrief(agent, spec) {
  return `# Agent Growth Seed: ${agent}

Generated: ${now}

## Default Research Task
Research the current best practices, repository activity, and design patterns relevant to ${spec.mission}. Record only durable, role-specific lessons. Update the agent memory if a repo materially improves the role's execution quality, gates, or evidence discipline.

## Top GitHub Watchlist
${repoMarkdown(spec.repos)}

## Role-Specific Evaluation Questions
- Which repositories provide immediately reusable implementation or safety patterns?
- Which patterns should become hooks, checklists, or Factory Brain entries?
- Which repositories should be watched but not integrated yet?
- What memory update helps this agent perform better on the next run?

## Output Contract
- Update this brief with dated findings when deeper research is run.
- Promote stable lessons to \`workspace/factory-brain/pages/agents/${agent}.md\`.
- Never replace empirical validation with repo popularity.
`
}

function agentBrain(agent, spec) {
  return `---
id: agent-${agent}
type: agent
title: "${agent}"
updatedAt: ${now}
source: "workspace/research/agent-growth/${agent}/source_manifest.json"
tags: ["agent-growth", "factory-brain", "${agent}"]
---

# ${agent}

## Compiled Truth
${agent} owns ${spec.mission}. Its initial growth loop is seeded with 10 GitHub repositories selected for directly reusable patterns, tooling, or safety controls. The agent should use these sources as a watchlist and promote only verified, role-specific lessons into memory.

---

## Current Watchlist
${repoMarkdown(spec.repos)}

## Timeline
- ${now}: Default growth seed created and indexed into FactoryGrid memory.
`
}

function manifest(agent, spec) {
  return JSON.stringify({
    agent,
    generatedAt: now,
    task: `Research and improve ${agent} capabilities for ${spec.mission}.`,
    sources: spec.repos.map(([repo, reason]) => ({
      name: repo,
      url: `https://github.com/${repo}`,
      reason,
    })),
  }, null, 2) + '\n'
}

function contextIndex(agent, spec) {
  return spec.repos.map(([repo, reason]) => JSON.stringify({
    id: `${agent}:${repo}`,
    agent,
    source: `https://github.com/${repo}`,
    semantic_triplet: {
      problem: `Improve ${agent} capability for ${spec.mission}.`,
      implementation: `Track ${repo} for ${reason}.`,
      outcome: 'Promote verified lessons into Factory Brain and role-specific gates.',
    },
  })).join('\n') + '\n'
}

function stablePointId(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32)
}

function truncateForEmbedding(file, content) {
  if (content.length <= maxEmbedChars) return content
  const boundary = Math.max(
    content.lastIndexOf('\n## ', maxEmbedChars),
    content.lastIndexOf('\n\n', maxEmbedChars),
    content.lastIndexOf('\n', maxEmbedChars),
  )
  const end = boundary > Math.floor(maxEmbedChars * 0.6) ? boundary : maxEmbedChars
  console.warn(`[agent-growth] Truncated ${file} from ${content.length} to ${end} chars for vector indexing`)
  return content.slice(0, end)
}

function vectorFor(text) {
  // Lexical fallback vector. Replace with a true embedding provider when the stack
  // exposes one; this keeps Qdrant search deterministic and useful meanwhile.
  const values = new Array(vectorSize).fill(0)
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9._/-]{1,80}/g) || []
  for (const token of tokens) {
    const h = crypto.createHash('sha256').update(token).digest()
    const index = h[0] % vectorSize
    const sign = h[1] % 2 === 0 ? 1 : -1
    values[index] += sign * (1 + Math.log1p(token.length))
  }
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1
  return values.map((v) => Number((v / norm).toFixed(6)))
}

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, qdrantUrl)
    const payload = body ? JSON.stringify(body) : undefined
    const req = http.request(url, {
      method,
      headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
      timeout: 4000,
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(data)
      else {
        const err = new Error(`${method} ${urlPath} -> ${res.statusCode}: ${data.slice(0, 500)}`)
        err.statusCode = res.statusCode
        err.body = data
        reject(err)
      }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error(`${method} ${urlPath} timed out`)))
    if (payload) req.write(payload)
    req.end()
  })
}

async function indexMemory() {
  try {
    if (process.env.FACTORY_GROWTH_REINDEX === 'true') {
      await request('DELETE', `/collections/${collection}`).catch((err) => {
        if (err.statusCode !== 404) throw err
      })
    }
    await request('PUT', `/collections/${collection}`, {
      vectors: { size: vectorSize, distance: 'Cosine' },
      hnsw_config: { m: 16, ef_construct: 100 },
    }).catch(async (err) => {
      if (err.statusCode !== 409) throw err
    })

    const memoryFiles = []
    const roots = [
      path.join(root, 'workspace', 'factory-brain', 'pages'),
      path.join(root, 'workspace', 'factory-brain', 'graph'),
      path.join(root, 'workspace', 'research'),
    ]
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(abs)
        else if (/\.(md|json|jsonl)$/.test(entry.name)) memoryFiles.push(abs)
      }
    }
    roots.forEach(walk)
    const points = memoryFiles.sort().map((file) => {
      const fullContent = fs.readFileSync(file, 'utf8')
      const content = truncateForEmbedding(file, fullContent)
      const rel = path.relative(root, file).replaceAll(path.sep, '/')
      return {
        id: stablePointId(rel),
        vector: vectorFor(`${rel}\n${content}`),
        payload: {
          path: rel,
          namespace: rel.includes('/agent-growth/') ? 'agent-growth' : rel.split('/').slice(0, 3).join('/'),
          updatedAt: fs.statSync(file).mtime.toISOString(),
          preview: content.slice(0, 1000),
          vectorKind: 'lexical-token-feature-fallback',
        },
      }
    })
    const batchSize = Number(process.env.FACTORY_MEMORY_UPSERT_BATCH_SIZE || 500)
    for (let i = 0; i < points.length; i += batchSize) {
      const chunk = points.slice(i, i + batchSize)
      await request('PUT', `/collections/${collection}/points?wait=true`, { points: chunk })
    }
    return { indexed: points.length, collection }
  } catch (err) {
    return { indexed: 0, collection, warning: String(err.message || err) }
  }
}

function seedArtifacts() {
  const forced = process.env.FACTORY_GROWTH_FORCE === 'true'
  let previous = null
  if (fs.existsSync(stateFile)) {
    try {
      previous = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    } catch (err) {
      console.warn(`[agent-growth] Could not parse seed state; reseeding: ${err.message}`)
    }
  }
  const alreadySeeded = previous?.version === 1 && !forced
  let written = 0

  for (const [agent, spec] of Object.entries(agents)) {
    const base = path.join(root, 'workspace', 'research', 'agent-growth', agent)
    const brain = path.join(root, 'workspace', 'factory-brain', 'pages', 'agents', `${agent}.md`)
    if (!alreadySeeded) {
      written += writeIfChanged(path.join(base, `${date}_seed.md`), agentBrief(agent, spec)) ? 1 : 0
      written += writeIfChanged(path.join(base, 'source_manifest.json'), manifest(agent, spec)) ? 1 : 0
      written += writeIfChanged(path.join(base, 'context-index.jsonl'), contextIndex(agent, spec)) ? 1 : 0
      written += writeIfChanged(brain, agentBrain(agent, spec)) ? 1 : 0
    }
  }

  if (!alreadySeeded) {
    const intake = `# Build Request: Agent Growth Seed

Generated: ${now}

Goal:
Run a default first-start growth task for every FactoryGrid agent. Each agent researches a role-specific GitHub watchlist, decides whether its memory or skills need updates, and writes durable findings into Factory Brain.

Target repo or workspace:
${root}

Hard constraints:
- Defensive, local-first, and role-scoped.
- No autonomous production network changes.
- Promote only verified lessons into memory.

Success criteria:
- Every agent has a default growth research artifact.
- Qdrant has a factory memory collection with indexed points.
- RuFloUI Memory, Neural, Workflows, and Hooks panels show live FactoryGrid state.
`
    written += writeIfChanged(path.join(root, 'workspace', 'spec-kit', 'intake', 'agent-growth-seed_request.md'), intake) ? 1 : 0
    writeIfChanged(stateFile, JSON.stringify({ version: 1, seededAt: now, agents: Object.keys(agents) }, null, 2) + '\n')
  }
  return { written, alreadySeeded }
}

const seeded = seedArtifacts()
const indexed = await indexMemory()
console.log(JSON.stringify({ ok: true, root, seeded, indexed }, null, 2))
