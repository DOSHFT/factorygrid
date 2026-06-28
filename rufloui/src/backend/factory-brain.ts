import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export type BrainPageType = 'run' | 'decision' | 'component' | 'skill' | 'agent' | 'source'

export interface BrainTimelineEntry {
  at: string
  event: string
  evidence?: string
}

export interface BrainPageInput {
  type: BrainPageType
  title: string
  compiledTruth: string
  timeline?: BrainTimelineEntry[]
  entities?: string[]
  tags?: string[]
  source?: string
}

export interface BrainPage extends Required<Omit<BrainPageInput, 'source'>> {
  id: string
  updatedAt: string
  source: string
  path: string
}

export interface SpecKitIntakeInput {
  title: string
  vision: string
  successCriteria?: string
  cautions?: string
  requestedMode?: 'PLAN' | 'DEV' | 'UAT' | 'PROD'
  researchStartUrls?: string[]
}

export interface JarvisInputMatrix {
  title: string
  vision: string
  endGoal?: string
  platforms?: string[]
  hardConstraints?: string[]
  threatModel?: string
  securityProperties?: string[]
  successCriteria?: string
  requestedMode?: 'PLAN' | 'DEV' | 'UAT' | 'PROD'
  recommendedModelProfile?: string
  memoryNamespaces?: string[]
  assumptions?: string[]
  openQuestions?: string[]
  validationCommands?: string[]
  sourceVerbal?: string
  researchStartUrls?: string[]
}

export interface SpecKitIntakeResult {
  runId: string
  requestPath: string
  specPath: string
  checklistPath: string
  brainPath: string
  nextGate: string
  phase?: string
  matrixPath?: string
}

export interface FactoryWorkflowGuide {
  intakeUrl: string
  artifactRoot: string
  phases: Array<{ phase: string; owner: string; writes: string; gate: string }>
  promptTemplate: string
  cautions: string[]
}

const DEFAULT_ROOT = '/home/revelation/factorygrid'

export function factoryRoot(): string {
  if (process.env.FACTORYGRID_ROOT && fs.existsSync(process.env.FACTORYGRID_ROOT)) return process.env.FACTORYGRID_ROOT
  if (fs.existsSync('/workspace')) return path.join('/workspace', '..')
  if (fs.existsSync(DEFAULT_ROOT)) return DEFAULT_ROOT
  return process.cwd()
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'request'
}

function normalizeResearchStartUrls(urls?: string[]): string[] {
  if (!Array.isArray(urls)) return []
  const normalized: string[] = []
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const candidate = raw.trim()
    if (!candidate) continue
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) continue
      const href = parsed.toString()
      if (!normalized.includes(href)) normalized.push(href)
    } catch {
      continue
    }
    if (normalized.length >= 3) break
  }
  return normalized
}

export function createRunId(title: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const digest = crypto.createHash('sha1').update(`${title}:${now.toISOString()}`).digest('hex').slice(0, 8)
  return `${date}-${slugify(title)}-${digest}`
}

function frontmatter(page: BrainPage): string {
  return [
    '---',
    `id: ${page.id}`,
    `type: ${page.type}`,
    `title: ${JSON.stringify(page.title)}`,
    `updatedAt: ${page.updatedAt}`,
    `source: ${JSON.stringify(page.source)}`,
    `entities: ${JSON.stringify(page.entities)}`,
    `tags: ${JSON.stringify(page.tags)}`,
    '---',
  ].join('\n')
}

export function renderBrainPage(page: BrainPage): string {
  const timeline = page.timeline.length
    ? page.timeline.map((item) => `- ${item.at}: ${item.event}${item.evidence ? ` [evidence: ${item.evidence}]` : ''}`).join('\n')
    : '- No timeline entries recorded yet.'
  return `${frontmatter(page)}\n\n# ${page.title}\n\n## Compiled Truth\n${page.compiledTruth.trim()}\n\n---\n\n## Timeline\n${timeline}\n`
}

export function writeBrainPage(input: BrainPageInput, root = factoryRoot(), now = new Date()): BrainPage {
  const id = `${input.type}-${slugify(input.title)}-${crypto.createHash('sha1').update(`${input.title}:${now.toISOString()}`).digest('hex').slice(0, 8)}`
  const relPath = path.join('workspace', 'factory-brain', 'pages', `${input.type}s`, `${id}.md`)
  const absPath = path.join(root, relPath)
  const page: BrainPage = {
    id,
    type: input.type,
    title: input.title,
    compiledTruth: input.compiledTruth,
    timeline: input.timeline || [],
    entities: input.entities || [],
    tags: input.tags || [],
    updatedAt: now.toISOString(),
    source: input.source || 'factorygrid',
    path: relPath,
  }
  ensureDir(path.dirname(absPath))
  fs.writeFileSync(absPath, renderBrainPage(page))
  return page
}

export function getFactoryWorkflowGuide(): FactoryWorkflowGuide {
  return {
    intakeUrl: 'http://localhost:28588/factory',
    artifactRoot: '/home/revelation/factorygrid/workspace/spec-kit',
    phases: [
      { phase: 'Intake', owner: 'Operator + Queen', writes: 'workspace/spec-kit/intake/<run_id>_request.md', gate: 'Prompt clarity and boundaries' },
      { phase: 'Spec', owner: 'Spec Kit + Queen', writes: 'workspace/spec-kit/specs/<run_id>_spec.md', gate: 'Human approval before implementation planning' },
      { phase: 'Research', owner: 'Researcher', writes: 'workspace/research/<run_id>_research_brief.md', gate: 'Sources, dates, and evidence captured' },
      { phase: 'Architecture', owner: 'Architect', writes: 'workspace/architecture/<run_id>_architecture_blueprint.json', gate: 'Allowed paths and protected paths reviewed' },
      { phase: 'Tasks', owner: 'Spec Kit + Queen', writes: 'workspace/spec-kit/tasks/<run_id>_tasks.md', gate: 'Tasks map to spec and blueprint' },
      { phase: 'DEV Execution', owner: 'Coder', writes: 'Docker-scoped workspace diffs', gate: 'Snapshot exists before writes' },
      { phase: 'Validation', owner: 'Tester', writes: 'workspace/testing/<run_id>_validation_report.md', gate: 'Real command output and exit codes' },
      { phase: 'Review', owner: 'Reviewer', writes: 'workspace/review/<run_id>_review_log.json', gate: 'Diff scope, security, tests' },
      { phase: 'Memory', owner: 'Documenter', writes: 'workspace/factory-brain/pages/runs/<run_id>.md', gate: 'Compiled truth plus timeline updated' },
    ],
    promptTemplate: [
      'Goal:',
      'Context and source links:',
      'Target repo or workspace:',
      'Hard constraints:',
      'Success criteria:',
      'Risks or caution areas:',
      'Preferred factory mode: PLAN / DEV / UAT / PROD',
    ].join('\n'),
    cautions: [
      'Name the target repository or workspace explicitly.',
      'State protected files, network exposure, credentials, and Docker impact up front.',
      'For DEV mode, implementation must run inside Docker-scoped execution where practical.',
      'For UAT or PROD, protected infrastructure changes require a gate before execution.',
    ],
  }
}

export function createSpecKitIntake(input: SpecKitIntakeInput, root = factoryRoot(), now = new Date()): SpecKitIntakeResult {
  const runId = createRunId(input.title, now)
  const base = path.join(root, 'workspace', 'spec-kit')
  const requestPath = path.join('workspace', 'spec-kit', 'intake', `${runId}_request.md`)
  const specPath = path.join('workspace', 'spec-kit', 'specs', `${runId}_spec.md`)
  const checklistPath = path.join('workspace', 'spec-kit', 'checklists', `${runId}_approval.md`)

  ensureDir(path.join(base, 'intake'))
  ensureDir(path.join(base, 'specs'))
  ensureDir(path.join(base, 'plans'))
  ensureDir(path.join(base, 'tasks'))
  ensureDir(path.join(base, 'checklists'))

  const mode = input.requestedMode || 'PLAN'
  const researchStartUrls = normalizeResearchStartUrls(input.researchStartUrls)
  const researchStartUrlBlock = researchStartUrls.length ? researchStartUrls.map((url) => `- ${url}`).join('\n') : '- None supplied.'
  const request = `# Build Request: ${input.title}\n\n- Run ID: ${runId}\n- Requested mode: ${mode}\n- Created: ${now.toISOString()}\n\n## Vision\n${input.vision.trim()}\n\n## Research Start URLs\n${researchStartUrlBlock}\n\n## Success Criteria\n${(input.successCriteria || 'Operator approval required before this moves to implementation planning.').trim()}\n\n## Cautions\n${(input.cautions || 'No additional cautions supplied.').trim()}\n\n## Next Gate\nQueen converts this intake into a Spec Kit specification, asks for corrections, and only then moves to research and architecture.\n`

  const spec = `# Spec: ${input.title}\n\n> Status: DRAFT. Generated from intake. Do not implement until approved.\n\n## User Story\nAs the operator, I want ${input.title} so the factory can turn written intent into researched, validated software changes.\n\n## Requirements\n- Preserve the original operator vision from ${requestPath}.\n- Start research from the operator-supplied URLs in ${requestPath} when present.\n- Query Factory Brain before research, architecture, or implementation.\n- Produce research, architecture, task, validation, review, and memory artifacts.\n- Keep protected infrastructure changes behind the active factory mode gates.\n\n## Acceptance Checks\n- [ ] Operator confirms the spec captures the intent.\n- [ ] Research sources are current and cited.\n- [ ] Architect declares allowed write paths.\n- [ ] Tester records real command output.\n- [ ] Reviewer signs off against the blueprint.\n`

  const checklist = `# Approval Checklist: ${input.title}\n\n- Run ID: ${runId}\n\n## Prompt Quality\n- [ ] Goal is concrete.\n- [ ] Target workspace is named.\n- [ ] Constraints are explicit.\n- [ ] Success criteria are testable.\n\n## Gate Decision\n- [ ] Approved for research.\n- [ ] Approved for architecture.\n- [ ] Approved for DEV execution.\n- [ ] Requires UAT/PROD gate before protected changes.\n`

  fs.writeFileSync(path.join(root, requestPath), request)
  fs.writeFileSync(path.join(root, specPath), spec)
  fs.writeFileSync(path.join(root, checklistPath), checklist)

  const brain = writeBrainPage({
    type: 'run',
    title: input.title,
    compiledTruth: `Factory request ${runId} was created in ${mode} mode. The current source of truth starts at ${requestPath}.`,
    timeline: [{ at: now.toISOString(), event: 'Spec Kit intake created', evidence: requestPath }],
    entities: ['FactoryGrid', 'Spec Kit', 'RuFlo', 'Factory Brain'],
    tags: ['intake', 'spec-kit', mode.toLowerCase()],
    source: requestPath,
  }, root, now)

  return {
    runId,
    requestPath,
    specPath,
    checklistPath,
    brainPath: brain.path,
    nextGate: 'Review the generated spec and approval checklist before research or implementation.',
  }
}

// Jarvis-aware richer creator (supports full matrix + initial phase for lifecycle)
export function createJarvisProjectFromMatrix(matrix: JarvisInputMatrix, root = factoryRoot(), now = new Date()): SpecKitIntakeResult {
  const runId = createRunId(matrix.title, now)
  const base = path.join(root, 'workspace', 'spec-kit')
  const intakeDir = path.join(base, 'intake')
  const requestPath = path.join('workspace', 'spec-kit', 'intake', `${runId}_request.md`)
  const matrixPath = path.join('workspace', 'spec-kit', 'intake', `${runId}_matrix.json`)
  const specPath = path.join('workspace', 'spec-kit', 'specs', `${runId}_spec.md`)
  const checklistPath = path.join('workspace', 'spec-kit', 'checklists', `${runId}_approval.md`)

  ensureDir(intakeDir)
  ensureDir(path.join(base, 'specs'))
  ensureDir(path.join(base, 'checklists'))

  const mode = matrix.requestedMode || 'PLAN'
  const initialPhase = 'research'
  matrix.researchStartUrls = normalizeResearchStartUrls(matrix.researchStartUrls)

  const matrixJson = JSON.stringify(matrix, null, 2)
  fs.writeFileSync(path.join(root, matrixPath), matrixJson)

  const researchStartUrlBlock = matrix.researchStartUrls.length ? matrix.researchStartUrls.map((url) => `- ${url}`).join('\n') : '- None supplied'
  const request = `# Jarvis Project Request: ${matrix.title}\n\n- Run ID: ${runId}\n- Initial Phase: ${initialPhase}\n- Mode: ${mode}\n- Created: ${now.toISOString()}\n\n## Vision (user)\n${(matrix.vision || '').trim()}\n\n## End Goal\n${(matrix.endGoal || 'TBD from planning').trim()}\n\n## Research Start URLs\n${researchStartUrlBlock}\n\n## Platforms & Constraints\n${(matrix.platforms || []).join(', ')}\n${(matrix.hardConstraints || []).map(c => `- ${c}`).join('\n')}\n\n## Threat Model & Security\n${matrix.threatModel || 'See matrix'}\nProperties: ${(matrix.securityProperties || []).join('; ')}\n\n## Success Criteria\n${(matrix.successCriteria || 'Operator + phase gates').trim()}\n\n## Recommended Execution\n- Model profile: ${matrix.recommendedModelProfile || 'default (matrix-driven)'}\n- Memory: ${(matrix.memoryNamespaces || []).join(', ')}\n\n## Open Questions (from planner)\n${(matrix.openQuestions || []).map(q => `- ${q}`).join('\n') || '- None recorded'}\n\n## Next Gate\nPlanning matrix approved. Enter Research phase (deep research + propose/review gates). Queen will advance phases with recorded outcomes.\n`

  const spec = `# Spec (Jarvis-initiated): ${matrix.title}\n\n> Status: DRAFT from Jarvis matrix. Phase: ${initialPhase}. Do not implement until research gate passes.\n\nSee ${requestPath} and ${matrixPath} for full matrix (threat model, security props, platforms, evidence needs).\n\n## Requirements (lifecycle)\n- Complete Research phase with provenance + review gates before Architecture/Dev.\n- Start research from the operator-supplied URLs in ${requestPath} when present.\n- Update matrix and brain at every phase transition.\n- Produce release artifacts only after Production gate.\n`

  const checklist = `# Phase Checklist (Jarvis project): ${matrix.title}\n\n- Run: ${runId}\n- Current: ${initialPhase}\n\n## Research Gate\n- [ ] Deep research + source manifests with hashes/timestamps\n- [ ] Propose/Review loop recorded (brain timeline)\n- [ ] Threat model + security properties satisfied or updated\n- [ ] Context pack emitted\n\n## Dev Gate\n- [ ] Guardrail snapshot\n- [ ] Tests + validation against matrix success\n\n## Release Gate\n- [ ] Portable product + export bundle\n- [ ] Security properties verified\n- [ ] Handoff + brain complete\n`

  fs.writeFileSync(path.join(root, requestPath), request)
  fs.writeFileSync(path.join(root, specPath), spec)
  fs.writeFileSync(path.join(root, checklistPath), checklist)

  const brain = writeBrainPage({
    type: 'run',
    title: matrix.title,
    compiledTruth: `Jarvis project ${runId} started in ${initialPhase} phase from verbal/matrix. Full matrix at ${matrixPath}. Lifecycle: Research (propose/review) → Dev → Release.`,
    timeline: [
      { at: now.toISOString(), event: 'Jarvis matrix + project item created', evidence: matrixPath },
      { at: now.toISOString(), event: `Phase set to ${initialPhase}`, evidence: requestPath }
    ],
    entities: ['Jarvis', 'Planning Agent', 'FactoryGrid', 'Spec Kit'],
    tags: ['jarvis', 'matrix', 'lifecycle', initialPhase, mode.toLowerCase()],
    source: matrixPath,
  }, root, now)

  return {
    runId,
    requestPath,
    specPath,
    checklistPath,
    brainPath: brain.path,
    nextGate: 'Enter Research phase. Run deep research + agent propose/review until Research gate passes.',
    phase: initialPhase,
    matrixPath,
  }
}

export function searchBrain(query: string, root = factoryRoot()): BrainPage[] {
  const pagesRoot = path.join(root, 'workspace', 'factory-brain', 'pages')
  if (!fs.existsSync(pagesRoot)) return []
  const lower = query.toLowerCase()
  const found: BrainPage[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const text = fs.readFileSync(abs, 'utf-8')
        if (!lower || text.toLowerCase().includes(lower)) {
          found.push({
            id: path.basename(entry.name, '.md'),
            type: 'source',
            title: (text.match(/^# (.+)$/m)?.[1] || entry.name).trim(),
            compiledTruth: (text.match(/## Compiled Truth\n([\s\S]*?)\n\n---/)?.[1] || '').trim(),
            timeline: [],
            entities: [],
            tags: [],
            updatedAt: fs.statSync(abs).mtime.toISOString(),
            source: 'factory-brain',
            path: path.relative(root, abs),
          })
        }
      }
    }
  }
  walk(pagesRoot)
  return found.slice(0, 25)
}
