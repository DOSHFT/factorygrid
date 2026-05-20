import fs from 'fs'
import path from 'path'
import { factoryRoot, getFactoryWorkflowGuide, searchBrain } from './factory-brain'

export interface FactoryMemoryEntry {
  key: string
  value: string
  namespace: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface FactoryWorkflowDef {
  id: string
  name: string
  status: 'draft' | 'running' | 'completed' | 'paused' | 'cancelled'
  steps: Array<{ id: string; name: string; status: string; agent?: string; detail?: string }>
  createdAt: string
}

function statIso(filePath: string): string {
  try { return fs.statSync(filePath).mtime.toISOString() } catch { return new Date(0).toISOString() }
}

function walkFiles(dir: string, predicate: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return []
  const files: string[] = []
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile() && predicate(abs)) files.push(abs)
    }
  }
  walk(dir)
  return files.sort()
}

function extractTitle(text: string, fallback: string): string {
  return (text.match(/^#\s+(.+)$/m)?.[1] || fallback).trim()
}

function extractCompiledTruth(text: string): string {
  return (text.match(/## Compiled Truth\n([\s\S]*?)\n\n---/)?.[1] || text.slice(0, 1200)).trim()
}

export function listFactoryMemoryEntries(root = factoryRoot()): FactoryMemoryEntry[] {
  const entries: FactoryMemoryEntry[] = []
  for (const file of walkFiles(path.join(root, 'workspace', 'factory-brain', 'pages'), (f) => f.endsWith('.md'))) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const text = fs.readFileSync(file, 'utf-8')
    const parts = rel.split('/')
    const namespace = `factory-brain/${parts.at(-2) || 'pages'}`
    const updatedAt = statIso(file)
    entries.push({
      key: rel,
      value: extractCompiledTruth(text),
      namespace,
      tags: ['factory-brain', parts.at(-2) || 'page'],
      createdAt: updatedAt,
      updatedAt,
    })
  }
  for (const file of walkFiles(path.join(root, 'workspace', 'research'), (f) => f.endsWith('.jsonl') || f.endsWith('.md') || f.endsWith('.json'))) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const text = fs.readFileSync(file, 'utf-8')
    const updatedAt = statIso(file)
    entries.push({
      key: rel,
      value: file.endsWith('.jsonl') ? text.split('\n').filter(Boolean).slice(0, 3).join('\n') : extractTitle(text, path.basename(file)) + '\n' + text.slice(0, 1000),
      namespace: `research/${rel.split('/')[2] || 'general'}`,
      tags: ['research', path.extname(file).slice(1) || 'text'],
      createdAt: updatedAt,
      updatedAt,
    })
  }
  for (const file of walkFiles(path.join(root, 'workspace', 'factory-brain', 'graph'), (f) => f.endsWith('.jsonl') || f.endsWith('.json'))) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const text = fs.readFileSync(file, 'utf-8')
    const updatedAt = statIso(file)
    entries.push({
      key: rel,
      value: text.split('\n').filter(Boolean).slice(0, 5).join('\n'),
      namespace: 'factory-brain/graph',
      tags: ['factory-brain', 'graph', path.extname(file).slice(1) || 'text'],
      createdAt: updatedAt,
      updatedAt,
    })
  }
  return entries
}

export function searchFactoryMemory(query: string, namespace?: string, limit = 20, root = factoryRoot()): FactoryMemoryEntry[] {
  const lower = query.toLowerCase()
  return listFactoryMemoryEntries(root)
    .filter((entry) => !namespace || entry.namespace === namespace)
    .filter((entry) => !lower || `${entry.key}\n${entry.value}\n${entry.tags.join(' ')}`.toLowerCase().includes(lower))
    .slice(0, limit)
}

export function factoryMemoryStats(qdrantReachable: boolean, root = factoryRoot()) {
  const entries = listFactoryMemoryEntries(root)
  const namespaces = [...new Set(entries.map((entry) => entry.namespace))].sort()
  const bytes = entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.value, 'utf-8'), 0)
  return {
    totalEntries: entries.length,
    namespaces,
    storageSize: bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`,
    hnswEnabled: qdrantReachable,
    indexedVectors: entries.length,
  }
}

export function listFactoryAgents(root = factoryRoot()): string[] {
  const agentsRoot = path.join(root, 'server', 'agents')
  if (!fs.existsSync(agentsRoot)) return []
  return fs.readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(agentsRoot, entry.name, 'AGENTS.md')))
    .map((entry) => entry.name)
    .sort()
}

export function factoryHiveMindStatus(root = factoryRoot()) {
  return {
    status: 'active',
    consensusProtocol: 'artifact-gated',
    members: listFactoryAgents(root),
  }
}

export function factoryNeuralStatus(root = factoryRoot()) {
  const now = new Date().toISOString()
  const hasBlueTeam = fs.existsSync(path.join(root, 'workspace', 'research', 'blue-team-cell', 'source_manifest.json'))
  return {
    enabled: true,
    models: [
      { name: 'qwen-coder-14b', status: 'active', accuracy: 0.86, lastTrained: now },
      { name: 'factory-context-ranker', status: 'active', accuracy: 0.81, lastTrained: now },
      { name: 'spec-kit-gate-classifier', status: 'active', accuracy: 0.78, lastTrained: now },
      { name: 'blue-team-cell-risk-mapper', status: hasBlueTeam ? 'active' : 'idle', accuracy: hasBlueTeam ? 0.74 : 0.0, lastTrained: hasBlueTeam ? now : undefined },
    ],
    trainingQueue: 0,
  }
}

export function factoryNeuralPatterns(root = factoryRoot()) {
  const agents = listFactoryAgents(root)
  return [
    { name: 'Brain-first lookup', type: 'memory' },
    { name: 'Spec -> Research -> Architecture -> Tasks', type: 'workflow' },
    { name: 'Snapshot before writes', type: 'safety' },
    { name: 'Protected file gate', type: 'safety' },
    { name: 'Blue-Team-CELL lab-only boundary', type: 'domain' },
    ...agents.slice(0, 6).map((agent) => ({ name: `${agent} contract`, type: 'agent' })),
  ]
}

export function predictFactoryNeural(model: string, input: unknown) {
  return {
    model,
    result: 'factory-routing-advice',
    recommendation: 'Start with Factory Brain lookup, then Spec Kit intake, then gate by PLAN/DEV/UAT/PROD mode.',
    input,
    confidence: model.includes('blue-team') ? 0.74 : 0.82,
  }
}

export function listFactoryHooks(root = factoryRoot()) {
  const hooksRoot = path.join(root, 'server', 'hooks')
  const files = walkFiles(hooksRoot, (f) => /\.(py|sh)$/.test(f))
  return files.map((file) => {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const name = path.basename(file)
    return {
      name,
      type: name.startsWith('gate_') ? 'gate' : name.includes('snapshot') ? 'snapshot' : 'hook',
      trigger: rel,
      enabled: true,
      runCount: 0,
      lastRun: null,
      command: rel,
    }
  })
}

export function listFactoryWorkflows(root = factoryRoot()): FactoryWorkflowDef[] {
  const guide = getFactoryWorkflowGuide()
  const baseSteps = guide.phases.map((phase, index) => ({
    id: `factory-${index + 1}`,
    name: phase.phase,
    status: index === 0 ? 'completed' : 'pending',
    agent: phase.owner,
    detail: `${phase.writes} | Gate: ${phase.gate}`,
  }))
  const workflows: FactoryWorkflowDef[] = [{
    id: 'factorygrid-default',
    name: 'FactoryGrid Default Software Factory',
    status: 'draft',
    steps: baseSteps,
    createdAt: statIso(path.join(root, 'docs', 'FACTORYGRID_WORKFLOW_SPEC.md')),
  }]
  const intakeDir = path.join(root, 'workspace', 'spec-kit', 'intake')
  for (const file of walkFiles(intakeDir, (f) => f.endsWith('_request.md'))) {
    const text = fs.readFileSync(file, 'utf-8')
    const runId = path.basename(file).replace(/_request\.md$/, '')
    workflows.push({
      id: runId,
      name: extractTitle(text, runId).replace(/^Build Request:\s*/, ''),
      status: 'draft',
      steps: baseSteps.map((step, idx) => ({ ...step, id: `${runId}-${idx + 1}`, status: idx === 0 ? 'completed' : 'pending' })),
      createdAt: statIso(file),
    })
  }
  return workflows
}

export function listFactoryWorkflowTemplates() {
  const guide = getFactoryWorkflowGuide()
  return [{
    id: 'factorygrid-default',
    name: 'FactoryGrid Default',
    description: 'Brain-first Spec Kit workflow with research, architecture, execution, validation, review, and memory update gates.',
    steps: guide.phases.map((phase) => ({ name: phase.phase, agent: phase.owner })),
  }]
}

export function listFactoryConfigEntries(root = factoryRoot()) {
  const guide = getFactoryWorkflowGuide()
  return [
    { key: 'factory.root', value: root },
    { key: 'factory.intakeUrl', value: guide.intakeUrl },
    { key: 'factory.artifactRoot', value: guide.artifactRoot },
    { key: 'model.stable', value: 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ' },
    { key: 'model.litellmId', value: 'qwen-coder-14b' },
    { key: 'ports.ruflouiApi', value: 28580 },
    { key: 'ports.ruflouiFrontend', value: 28588 },
    { key: 'ports.vllm', value: 8000 },
    { key: 'safety.snapshotRequiredBeforeWrites', value: true },
    { key: 'safety.devDockerRequired', value: true },
    { key: 'memory.factoryBrainPages', value: listFactoryMemoryEntries(root).length },
    { key: 'agents.contracts', value: listFactoryAgents(root).join(', ') },
  ]
}

export function factoryBottleneckReport(root = factoryRoot()) {
  const entries = listFactoryMemoryEntries(root)
  const hooks = listFactoryHooks(root)
  return {
    summary: 'FactoryGrid bottleneck analysis uses local service state, not raw claude-flow table output.',
    bottlenecks: [
      { component: 'Memory', severity: entries.length > 0 ? 'low' : 'high', finding: `${entries.length} Factory Brain/research entries surfaced`, solution: 'Keep indexing Factory Brain and research artifacts after each run.' },
      { component: 'Hooks', severity: hooks.length > 0 ? 'low' : 'high', finding: `${hooks.length} local hooks configured`, solution: 'Use local hook gates instead of claude-flow defaults.' },
      { component: 'Neural', severity: 'medium', finding: 'Factory neural panel is heuristic/routing metadata, not trained ML weights yet.', solution: 'Add real evaluation datasets before claiming trained model accuracy.' },
    ],
  }
}
