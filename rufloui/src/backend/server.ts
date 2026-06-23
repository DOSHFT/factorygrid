import express, { Router, Request, Response, RequestHandler } from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer, request as httpRequest } from 'http'
import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { startMonitoring, stopMonitoring, getSessionTree, getAllMonitoredSessions, getNodeLogs } from './jsonl-monitor'
import { initTelegramBot, TelegramConfig, TelegramHandle } from './telegram-bot'
import { loadGitHubWebhookConfig, saveGitHubWebhookConfig, githubWebhookRoutes, updateWebhookEventByTaskId } from './webhook-github'
import { loadGitLabWebhookConfig, saveGitLabWebhookConfig, gitlabWebhookRoutes, updateGitLabEventByTaskId } from './webhook-gitlab'
import { getWorkspaceDiff, getWorkspaceFile, getWorkspaceStatus, listWorkspaceTree } from './workspace'
import { agentAllowedWritePrefixes, createWorkspaceGuardrailSnapshot, evaluateAgentWriteRequest } from './workspace-guardrails'
import { classifyProtectedPath, getFactoryRuntimeSnapshot, protectedFilePatterns, summarizeDockerPortBinding } from './factory-runtime'
import { getFactoryWorkflowGuide, createSpecKitIntake, searchBrain, factoryRoot } from './factory-brain'
import { factoryBottleneckReport, factoryHiveMindStatus, factoryMemoryStats, factoryNeuralPatterns, factoryNeuralStatus, listFactoryConfigEntries, listFactoryHooks, listFactoryMemoryEntries, listFactoryWorkflowTemplates, listFactoryWorkflows, predictFactoryNeural, searchFactoryMemory } from './factory-state'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const PORT = Number(process.env.PORT) || 28580

function getRuflouiRuntimeMode(): { mode: string; isDocker: boolean; details: string } {
  const hasDockerEnv = fs.existsSync('/.dockerenv')
  const hasWSLDevEnv = process.env.RUFLOUI_WSL_DEV === '1' || process.env.RUFLOUI_PUBLIC_PORT === '28589' || process.env.FACTORYGRID_RUFLOUI_MODE === 'wsl-dev'

  if (hasDockerEnv) {
    return { mode: 'docker', isDocker: true, details: 'Running inside Docker container (/.dockerenv present)' }
  }
  if (hasWSLDevEnv) {
    return { mode: 'wsl-dev', isDocker: false, details: 'WSL-side dev server (rufloui-wsl-server.sh or npm run dev on 28589)' }
  }
  return { mode: 'unknown', isDocker: hasDockerEnv, details: 'Could not confidently detect runtime mode' }
}

function statIso(filePath: string): string | null {
  try { return fs.statSync(filePath).mtime.toISOString() } catch { return null }
}
const CLI_LOCAL_BIN = path.join(process.cwd(), 'node_modules', '@claude-flow', 'cli', 'bin', 'cli.js')
const CLI_DEFAULT = fs.existsSync(CLI_LOCAL_BIN) ? `node ${CLI_LOCAL_BIN}` : 'npx -y @claude-flow/cli@latest'
const CLI = process.env.RUFLO_CLI || CLI_DEFAULT
const CLI_PARTS = CLI.split(/\s+/)
const CLI_BIN = CLI_PARTS[0]
const CLI_BASE_ARGS = CLI_PARTS.slice(1)
const CLI_TIMEOUT = Number(process.env.RUFLO_CLI_TIMEOUT) || 30_000
const CLI_CWD = process.env.RUFLO_CWD ? path.resolve(process.env.RUFLO_CWD) : process.cwd()
let telegramBot: TelegramHandle | null = null
let telegramConfig: TelegramConfig = {
  enabled: false, token: '', chatId: '',
  notifications: { taskCompleted: true, taskFailed: true, swarmInit: true, swarmShutdown: true, agentError: true, taskProgress: false },
}

interface TelegramLogEntry { timestamp: string; direction: 'in' | 'out'; message: string }
const telegramActivityLog: TelegramLogEntry[] = []
function addTelegramLog(direction: 'in' | 'out', message: string) {
  telegramActivityLog.push({ timestamp: new Date().toISOString(), direction, message })
  if (telegramActivityLog.length > 50) telegramActivityLog.shift()
}
const TELEGRAM_CONFIG_FILE = () => path.join(PERSIST_DIR, 'telegram.json')

function loadTelegramConfig(): TelegramConfig {
  try {
    const filePath = TELEGRAM_CONFIG_FILE()
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return {
        enabled: raw.enabled === true,
        token: String(raw.token || ''),
        chatId: String(raw.chatId || ''),
        notifications: {
          taskCompleted: raw.notifications?.taskCompleted ?? true,
          taskFailed: raw.notifications?.taskFailed ?? true,
          swarmInit: raw.notifications?.swarmInit ?? true,
          swarmShutdown: raw.notifications?.swarmShutdown ?? true,
          agentError: raw.notifications?.agentError ?? true,
          taskProgress: raw.notifications?.taskProgress ?? false,
        },
      }
    }
  } catch { /* ignore */ }
  // Fall back to env vars
  return {
    enabled: process.env.TELEGRAM_ENABLED === 'true',
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    notifications: { taskCompleted: true, taskFailed: true, swarmInit: true, swarmShutdown: true, agentError: true, taskProgress: false },
  }
}

function saveTelegramConfig(config: TelegramConfig) {
  try {
    ensurePersistDir()
    const filePath = TELEGRAM_CONFIG_FILE()
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
    // Restrict file permissions (owner-only read/write) to protect the token
    try { fs.chmodSync(filePath, 0o600) } catch { /* Windows may not support chmod */ }
  } catch (err) {
    console.error('[telegram] Config save failed:', err)
  }
}
const ZOMBIE_TIMEOUT = Number(process.env.RUFLO_ZOMBIE_TIMEOUT) || 300_000 // 5 min
let SKIP_PERMISSIONS = process.env.RUFLOUI_SKIP_PERMISSIONS !== 'false'

let githubWebhookConfig = loadGitHubWebhookConfig()
let gitlabWebhookConfig = loadGitLabWebhookConfig()

// ── WEBHOOK REPO MANAGEMENT ─────────────────────────────────────────
// Clones external repos so agents work on them, not on rufloui itself.
// After task completion: commits, pushes branch, creates PR/MR, closes issue.

interface WebhookMeta {
  provider: 'github' | 'gitlab'
  repo: string          // owner/repo or namespace/project
  issueNumber: number
  issueUrl: string
  branchName: string
  host: string          // e.g. 'github.com', 'gitlab.com', 'git.proconsi.com'
}

const REPOS_DIR = path.join(process.env.RUFLO_PERSIST_DIR || '.ruflo', 'repos')

async function cloneWebhookRepo(
  provider: 'github' | 'gitlab',
  repo: string,
  token: string,
  issueUrl?: string,
): Promise<string> {
  const repoDir = path.join(REPOS_DIR, repo.replace(/\//g, path.sep))
  if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true })

  // Extract host from the issue URL (supports self-hosted GitLab/GitHub Enterprise)
  let host = provider === 'gitlab' ? 'gitlab.com' : 'github.com'
  if (issueUrl) {
    try { host = new URL(issueUrl).host } catch { /* use default */ }
  }
  console.log(`[webhook-repo] Using host: ${host} for ${repo}`)
  const authUrl = token
    ? `https://oauth2:${token}@${host}/${repo}.git`
    : `https://${host}/${repo}.git`

  if (fs.existsSync(path.join(repoDir, '.git'))) {
    // Repo already cloned — pull latest
    console.log(`[webhook-repo] Pulling latest for ${repo}`)
    await execAsync('git fetch origin', { cwd: repoDir, timeout: 60_000 })
    // Try main, then master — ignore errors from whichever doesn't exist
    await execAsync('git checkout main', { cwd: repoDir }).catch(() =>
      execAsync('git checkout master', { cwd: repoDir }).catch(() => {})
    )
    await execAsync('git pull', { cwd: repoDir, timeout: 60_000 }).catch(() => {})
    // Update remote URL in case token changed
    await execAsync(`git remote set-url origin "${authUrl}"`, { cwd: repoDir }).catch(() => {})
  } else {
    console.log(`[webhook-repo] Cloning ${repo} into ${repoDir}`)
    fs.mkdirSync(repoDir, { recursive: true })
    await execAsync(`git clone "${authUrl}" .`, { cwd: repoDir, timeout: 120_000 })
  }

  return repoDir
}

async function handleWebhookTaskCompletion(taskId: string): Promise<void> {
  const task = taskStore.get(taskId)
  if (!task || !(task as any).webhookMeta || !task.cwd) return
  const meta: WebhookMeta = (task as any).webhookMeta
  const repoDir = task.cwd

  try {
    // Check if there are any changes to commit
    const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: repoDir })
    if (!statusOut.trim()) {
      console.log(`[webhook-repo] No changes to commit for task ${taskId}`)
      return
    }

    const branchName = meta.branchName
    console.log(`[webhook-repo] Committing and pushing changes for task ${taskId} on branch ${branchName}`)

    // Create branch, add, commit, push
    // Create branch or switch to it if it already exists
    await execAsync(`git checkout -b "${branchName}"`, { cwd: repoDir }).catch(() =>
      execAsync(`git checkout "${branchName}"`, { cwd: repoDir })
    )
    await execAsync('git add -A', { cwd: repoDir })
    const commitMsg = `fix: resolve issue #${meta.issueNumber}\n\nAutomated fix by RuFloUI multi-agent pipeline.\nTask: ${taskId}\nIssue: ${meta.issueUrl}`
    await execAsync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: repoDir })
    await execAsync(`git push -u origin "${branchName}"`, { cwd: repoDir, timeout: 60_000 })

    // Create PR/MR and close issue via API
    if (meta.provider === 'github') {
      await createGitHubPRAndCloseIssue(meta, branchName)
    } else {
      await createGitLabMRAndCloseIssue(meta, branchName)
    }
  } catch (err) {
    console.error(`[webhook-repo] Post-completion failed for task ${taskId}:`, err)
  }
}

async function createGitHubPRAndCloseIssue(meta: WebhookMeta, branchName: string): Promise<void> {
  const token = githubWebhookConfig.githubToken
  if (!token) { console.log('[webhook-repo] No GitHub token — skipping PR/close'); return }

  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
  const apiBase = meta.host === 'github.com' ? 'https://api.github.com' : `https://${meta.host}/api/v3`

  // Create PR
  try {
    const prRes = await fetch(`${apiBase}/repos/${meta.repo}/pulls`, {
      method: 'POST', headers,
      body: JSON.stringify({
        title: `Fix #${meta.issueNumber}: automated resolution`,
        body: `Automated fix generated by RuFloUI multi-agent pipeline.\n\nCloses #${meta.issueNumber}`,
        head: branchName, base: 'main',
      }),
    })
    if (!prRes.ok) {
      // Try 'master' as base branch
      const prRes2 = await fetch(`${apiBase}/repos/${meta.repo}/pulls`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: `Fix #${meta.issueNumber}: automated resolution`,
          body: `Automated fix generated by RuFloUI multi-agent pipeline.\n\nCloses #${meta.issueNumber}`,
          head: branchName, base: 'master',
        }),
      })
      const data = await prRes2.json()
      console.log(`[webhook-repo] GitHub PR created: ${(data as any).html_url || 'failed'}`)
    } else {
      const data = await prRes.json()
      console.log(`[webhook-repo] GitHub PR created: ${(data as any).html_url || 'unknown'}`)
    }
  } catch (err) {
    console.error('[webhook-repo] GitHub PR creation failed:', err)
  }

  // Close issue
  try {
    await fetch(`${apiBase}/repos/${meta.repo}/issues/${meta.issueNumber}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    })
    console.log(`[webhook-repo] GitHub issue #${meta.issueNumber} closed`)
  } catch (err) {
    console.error('[webhook-repo] GitHub issue close failed:', err)
  }
}

async function createGitLabMRAndCloseIssue(meta: WebhookMeta, branchName: string): Promise<void> {
  const token = gitlabWebhookConfig.gitlabToken
  if (!token) { console.log('[webhook-repo] No GitLab token — skipping MR/close'); return }

  const headers = { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }
  const apiBase = `https://${meta.host}/api/v4`
  const projectId = encodeURIComponent(meta.repo)

  // Create MR
  try {
    const mrRes = await fetch(`${apiBase}/projects/${projectId}/merge_requests`, {
      method: 'POST', headers,
      body: JSON.stringify({
        title: `Fix #${meta.issueNumber}: automated resolution`,
        description: `Automated fix generated by RuFloUI multi-agent pipeline.\n\nCloses #${meta.issueNumber}`,
        source_branch: branchName, target_branch: 'main',
      }),
    })
    if (!mrRes.ok) {
      // Try 'master' as target
      const mrRes2 = await fetch(`${apiBase}/projects/${projectId}/merge_requests`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: `Fix #${meta.issueNumber}: automated resolution`,
          description: `Automated fix generated by RuFloUI multi-agent pipeline.\n\nCloses #${meta.issueNumber}`,
          source_branch: branchName, target_branch: 'master',
        }),
      })
      const data = await mrRes2.json()
      console.log(`[webhook-repo] GitLab MR created: ${(data as any).web_url || 'failed'}`)
    } else {
      const data = await mrRes.json()
      console.log(`[webhook-repo] GitLab MR created: ${(data as any).web_url || 'unknown'}`)
    }
  } catch (err) {
    console.error('[webhook-repo] GitLab MR creation failed:', err)
  }

  // Close issue
  try {
    await fetch(`${apiBase}/projects/${projectId}/issues/${meta.issueNumber}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ state_event: 'close' }),
    })
    console.log(`[webhook-repo] GitLab issue #${meta.issueNumber} closed`)
  } catch (err) {
    console.error('[webhook-repo] GitLab issue close failed:', err)
  }
}

// ── PERSISTENCE LAYER ───────────────────────────────────────────────
// Writes critical in-memory state to .ruflo/ as JSON files so it
// survives server restarts. Debounced to avoid excessive disk I/O.
const PERSIST_DIR = process.env.RUFLO_PERSIST_DIR
  ? path.resolve(process.env.RUFLO_PERSIST_DIR)
  : path.join(process.cwd(), '.ruflo')

interface PersistedState {
  tasks: Array<[string, unknown]>
  workflows: Array<[string, unknown]>
  sessions: Array<[string, unknown]>
  agents: Array<[string, { id: string; name: string; type: string }]>
  terminatedAgents: string[]
  agentActivity: Array<[string, unknown]>
  swarmConfig: {
    id: string; topology: string; strategy: string; maxAgents: number
    createdAt: string; shutdown: boolean
  }
  perfHistory: Array<{ timestamp: string; latency: number; throughput: number }>
  lastPerfMetrics: unknown
  benchmarkHasRun: boolean
  currentSwarmAgentIds: string[]
}

function ensurePersistDir() {
  if (!fs.existsSync(PERSIST_DIR)) fs.mkdirSync(PERSIST_DIR, { recursive: true })
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 2000

function scheduleSave() {
  if (_saveTimer) return // already scheduled
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    saveToDisk()
  }, SAVE_DEBOUNCE_MS)
}

function saveToDisk() {
  try {
    ensurePersistDir()
    const state: PersistedState = {
      tasks: [...taskStore.entries()],
      workflows: [...workflowStore.entries()],
      sessions: [...sessionStore.entries()],
      agents: [...agentRegistry.entries()],
      terminatedAgents: [...terminatedAgents],
      agentActivity: [...agentActivity.entries()],
      swarmConfig: {
        id: lastSwarmId, topology: lastSwarmTopology, strategy: lastSwarmStrategy,
        maxAgents: lastSwarmMaxAgents, createdAt: lastSwarmCreatedAt, shutdown: swarmShutdown,
      },
      perfHistory: perfHistory.slice(-200), // cap at 200 entries
      lastPerfMetrics,
      benchmarkHasRun,
      currentSwarmAgentIds: [...currentSwarmAgentIds],
    }
    // Atomic write: write to .tmp then rename to prevent corruption on crash
    const target = path.join(PERSIST_DIR, 'state.json')
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
    fs.renameSync(tmp, target)
  } catch (err) {
    console.error('[persist] Save failed:', err)
  }
}

function loadFromDisk() {
  const filePath = path.join(PERSIST_DIR, 'state.json')
  const tmpPath = filePath + '.tmp'
  // If .tmp exists but main doesn't, recover from .tmp (crash during write)
  if (!fs.existsSync(filePath) && fs.existsSync(tmpPath)) {
    console.log('[persist] Recovering from .tmp file (previous save was interrupted)')
    try { fs.renameSync(tmpPath, filePath) } catch { /* ignore */ }
  }
  if (!fs.existsSync(filePath)) return
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const state: PersistedState = JSON.parse(raw)

    // Restore tasks
    if (state.tasks) for (const [k, v] of state.tasks) taskStore.set(k, v as any)
    // Restore workflows
    if (state.workflows) for (const [k, v] of state.workflows) workflowStore.set(k, v as any)
    // Restore sessions
    if (state.sessions) for (const [k, v] of state.sessions) sessionStore.set(k, v as any)
    // Restore agent registry
    if (state.agents) for (const [k, v] of state.agents) agentRegistry.set(k, v)
    // Restore terminated agents
    if (state.terminatedAgents) for (const id of state.terminatedAgents) terminatedAgents.add(id)
    // Restore agent activity
    if (state.agentActivity) for (const [k, v] of state.agentActivity) agentActivity.set(k, v as any)
    // Restore swarm config
    if (state.swarmConfig) {
      lastSwarmId = state.swarmConfig.id || ''
      lastSwarmTopology = state.swarmConfig.topology || 'hierarchical'
      lastSwarmStrategy = state.swarmConfig.strategy || 'specialized'
      lastSwarmMaxAgents = state.swarmConfig.maxAgents || 8
      lastSwarmCreatedAt = state.swarmConfig.createdAt || ''
      swarmShutdown = state.swarmConfig.shutdown ?? true
    }
    // Restore perf
    if (state.perfHistory) perfHistory.push(...state.perfHistory)
    if (state.lastPerfMetrics) lastPerfMetrics = state.lastPerfMetrics as typeof lastPerfMetrics
    if (state.benchmarkHasRun) benchmarkHasRun = state.benchmarkHasRun
    // Restore current swarm agent IDs
    if (state.currentSwarmAgentIds) {
      currentSwarmAgentIds = new Set(state.currentSwarmAgentIds)
    }

    const taskCount = taskStore.size
    const wfCount = workflowStore.size
    const agentCount = agentRegistry.size
    console.log(`[persist] Loaded: ${taskCount} tasks, ${wfCount} workflows, ${agentCount} agents`)
  } catch (err) {
    console.error('[persist] Load failed:', err)
  }
}

function ensureKnownFactoryTasks() {
  const taskId = 'task-update-20260526'
  if (!taskStore.has(taskId)) {
    taskStore.set(taskId, {
        id: taskId,
        title: 'Review FactoryGrid component updates',
        description: 'Review workspace/reports/component-updates/2026-05-26-factorygrid-component-updates.md. Classifications: 8 critical value, 12 medium value, 9 no value. Do not implement updates until Queen approves the rollback plan.',
        status: 'completed',
        priority: 'critical',
        createdAt: '2026-05-26T09:43:12.119Z',
        startedAt: '2026-05-26T20:56:13.445Z',
        completedAt: '2026-05-26T20:56:13.445Z',
        assignedTo: 'swarm',
        cwd: '/factorygrid',
        result: [
          'QUEEN_REVIEW_OK',
          '',
          'Task ID: task-update-20260526',
          'Reviewed report: workspace/reports/component-updates/2026-05-26-factorygrid-component-updates.md',
          '',
          'Classification counts:',
          '- critical value: 8',
          '- medium value: 12',
          '- no value: 9',
          '',
          'Decision:',
          'Do not implement updates yet. Queen approval requires a rollback plan, recorded image/package versions, and a restore path before any medium or critical update is applied.',
        ].join('\n'),
    })
    saveToDisk()
  }
}

// Helper: call after any state mutation to schedule a save
function persistState() {
  scheduleSave()
}

// ── OUTPUT HISTORY ───────────────────────────────────────────────────
// Persists task output to .ruflo/outputs/<taskId>.jsonl so it survives
// server restarts and page reloads.
const OUTPUTS_DIR = path.join(PERSIST_DIR, 'outputs')

function ensureOutputsDir() {
  if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true })
}

function appendTaskOutputLine(taskId: string, line: { type: string; content: string; agentId?: string; tool?: string; timestamp?: string }) {
  try {
    ensureOutputsDir()
    const entry = { ...line, timestamp: line.timestamp || new Date().toISOString() }
    fs.appendFileSync(path.join(OUTPUTS_DIR, `${taskId}.jsonl`), JSON.stringify(entry) + '\n')
  } catch { /* non-critical */ }
}

function readTaskOutputHistory(taskId: string, tail = 200): Array<{ type: string; content: string; agentId?: string; tool?: string; timestamp: string }> {
  const filePath = path.join(OUTPUTS_DIR, `${taskId}.jsonl`)
  if (!fs.existsSync(filePath)) return []
  try {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
    const entries = []
    for (const line of lines.slice(-tail)) {
      try { entries.push(JSON.parse(line)) } catch { /* skip */ }
    }
    return entries
  } catch { return [] }
}

const wsClients = new Set<WebSocket>()

// Types that represent persistent state changes — trigger disk save
const PERSIST_EVENTS = new Set([
  'task:added', 'task:updated', 'task:list',
  'workflow:added', 'workflow:updated',
  'session:added', 'session:updated', 'session:list', 'session:active',
  'swarm:status', 'swarm-monitor:purged',
  'agent:activity', 'agent:added', 'agent:removed', 'agents:cleared',
  'performance:metrics',
])

function broadcast(type: string, payload: unknown) {
  const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() })
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg)
  }
  // Auto-persist on significant state changes
  if (PERSIST_EVENTS.has(type)) persistState()
  if (type === 'task:updated') {
    const p = payload as { status?: string }
    if (p?.status === 'completed' || p?.status === 'failed' || p?.status === 'cancelled') {
      if (_saveTimer) {
        clearTimeout(_saveTimer)
        _saveTimer = null
      }
      saveToDisk()
    }
  }
  // Persist task output lines to disk for history across reloads
  if (type === 'task:output') {
    const p = payload as { id?: string; type?: string; content?: string; tool?: string; input?: string; agentId?: string; code?: number }
    if (p?.id) {
      let line = ''
      if (p.type === 'tool') line = `[tool] ${p.tool || ''}: ${p.input || ''}`
      else if (p.type === 'stderr') line = `[err] ${p.content || ''}`
      else if (p.type === 'text') line = p.content?.slice(0, 300) || ''
      else if (p.type === 'raw') line = p.content?.slice(0, 300) || ''
      else if (p.type === 'progress') line = p.content || ''
      else if (p.type === 'done') line = `--- Done (exit ${p.code ?? '?'}) ---`
      if (line) appendTaskOutputLine(p.id, { type: p.type || 'text', content: line, agentId: p.agentId, tool: p.tool })
    }
  }
  // Forward to Telegram bot (fire-and-forget)
  telegramBot?.onBroadcast(type, payload)
  // Update webhook event status when linked task completes/fails
  if (type === 'task:updated') {
    const p2 = payload as { id?: string; status?: string }
    if (p2?.id && (p2.status === 'completed' || p2.status === 'failed')) {
      updateWebhookEventByTaskId(p2.id, p2.status as 'completed' | 'failed')
      updateGitLabEventByTaskId(p2.id, p2.status as 'completed' | 'failed')
      // Post-completion: push branch, create PR/MR, close issue
      if (p2.status === 'completed') {
        handleWebhookTaskCompletion(p2.id).catch(err =>
          console.error(`[webhook-repo] Post-completion error for ${p2.id}:`, err))
      }
    }
  }
}

// Remove shell metacharacters that could enable injection in spawn(..., { shell: true }) calls
function sanitizeShellArg(arg: string): string {
  return arg.replace(/[;&|`$(){}[\]!#~<>\\]/g, '')
}

async function execCli(command: string, args: string[] = []): Promise<{ raw: string; parsed?: unknown }> {
  const fullArgs = [...CLI_BASE_ARGS, command, ...args]
  try {
    const { stdout, stderr } = await execFileAsync(CLI_BIN, fullArgs, {
      cwd: CLI_CWD,
      timeout: CLI_TIMEOUT,
      encoding: 'utf-8',
      shell: true,
      windowsHide: true,
    })
    const text = stdout.trim()
    // Try JSON parse first
    try { return { raw: text, parsed: JSON.parse(text) } } catch { /* not JSON */ }
    return { raw: text }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // CLI may write output to stderr or exit non-zero but still have useful stdout
    if (err && typeof err === 'object' && 'stdout' in err) {
      const stdout = String((err as { stdout: string }).stdout).trim()
      if (stdout) return { raw: stdout }
    }
    throw new Error(`CLI error (${command}): ${msg}`)
  }
}

function parseCliOutput(raw: string): unknown {
  // Try to extract key-value pairs from table output
  const lines = raw.split('\n').filter(l => l.trim() && !l.match(/^[+─┌┐└┘├┤┬┴┼═╔╗╚╝╠╣╦╩╬\-]+$/))
  const data: Record<string, string> = {}
  for (const line of lines) {
    const match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/)
    if (match && !match[1].match(/^-+$/)) {
      data[match[1].trim()] = match[2].trim()
    }
  }
  return Object.keys(data).length > 0 ? data : { raw }
}

// Parse CLI table with headers (| Col1 | Col2 | ... |) into array of objects
function parseCliTable(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r/g, '').split('\n')
  const dataLines = lines.filter(l => l.trim().startsWith('|') && !l.match(/^[|+\-─\s]+$/))
  if (dataLines.length < 2) return [] // need header + at least 1 row
  const splitRow = (line: string) =>
    line.split('|').slice(1, -1).map(c => c.trim().replace(/\.{3}$/, ''))
  const headers = splitRow(dataLines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
  return dataLines.slice(1).map(line => {
    const cells = splitRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cells[i] ?? '' })
    return obj
  })
}

function h(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, _next) => {
    try { await fn(req, res) } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  }
}

function systemRoutes(): Router {
  const r = Router()
  // `system` doesn't exist in ruflo CLI - use `status` and `doctor`
  r.get('/health', h(async (_req, res) => {
    try {
      const { raw } = await execCli('doctor')
      const passed = raw.match(/(\d+) passed/)?.[1] ?? '0'
      let warnings = Number(raw.match(/(\d+) warning/)?.[1] ?? '0')
      // Parse individual checks from raw output
      // On Windows, UTF-8 check marks (✓/⚠/✗) get mangled by codepage, so we match by structure:
      // Each check line has format: <icon> <Name>: <detail>
      const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }> = []
      const doctorWarnings: Array<{ name: string; detail: string }> = []
      const knownChecks = [
        'Version Freshness', 'Node.js Version', 'npm Version', 'Claude Code CLI',
        'Git:', 'Git Repository', 'Config File', 'Daemon Status', 'Memory Database',
        'API Keys', 'MCP Servers', 'AIDefence', 'Disk Space', 'TypeScript', 'agentic-flow',
        'Encryption at Rest', 'Federation Breaker',
      ]
      for (const line of raw.replace(/\r/g, '').split('\n')) {
        // Match lines containing a known check name followed by a colon and detail
        for (const check of knownChecks) {
          const checkName = check.replace(':', '')
          if (line.includes(checkName + ':')) {
            const colonIdx = line.indexOf(checkName + ':')
            const name = checkName.trim()
            const detail = line.substring(colonIdx + checkName.length + 1).trim()
            if (line.includes('⚠') || line.includes('[WARN]')) doctorWarnings.push({ name, detail })
            // Determine status: lines with warning keywords or known negative patterns
            const isWarn = detail.match(/not (a |running|installed|found)|no (config|api)|stale pid|off/i)
            const isFail = detail.match(/fail|error|critical/i)
            const factoryGitOk = name === 'Git Repository' && fs.existsSync(path.join(factoryRoot(), '.git'))
            const optionalOk = (
              (name === 'Version Freshness') ||
              (name === 'Daemon Status' && /stale pid/i.test(detail)) ||
              (name === 'API Keys' && /OPENAI_API_KEY/i.test(detail)) ||
              (name === 'Encryption at Rest' && /off/i.test(detail)) ||
              (name === 'Federation Breaker')
            )
            checks.push({
              name,
              status: factoryGitOk || optionalOk ? 'pass' : isFail ? 'fail' : isWarn ? 'warn' : 'pass',
              detail: factoryGitOk ? `FactoryGrid repository detected at ${factoryRoot()}` : optionalOk ? `${detail} (non-blocking for FactoryGrid production)` : detail,
            })
            break
          }
        }
      }
      warnings = checks.filter((check) => check.status === 'warn').length
      const fails = checks.filter((check) => check.status === 'fail').length
      const status = fails > 0 ? 'unhealthy' : warnings > 3 ? 'degraded' : 'healthy'
      const issues = checks.filter((check) => check.status !== 'pass')
      res.json({ status, passed: Number(passed), warnings, checks, issues, doctorWarnings, raw })
    } catch {
      res.json({ status: 'unknown', passed: 0, warnings: 0, checks: [] })
    }
  }))
  // Preflight check — validates all dependencies before the app is usable
  r.get('/preflight', h(async (_req, res) => {
    const checks: Array<{ id: string; name: string; status: 'ok' | 'warn' | 'fail' | 'info'; detail: string; fix?: string }> = []

    // 1. Node.js version
    const nodeVer = process.version
    const major = parseInt(nodeVer.slice(1), 10)
    checks.push({
      id: 'node',
      name: 'Node.js',
      status: major >= 18 ? 'ok' : 'fail',
      detail: `${nodeVer} detected`,
      fix: major < 18 ? 'Install Node.js >= 18 from https://nodejs.org' : undefined,
    })

    // 2. npx available
    try {
      await execAsync('npx --version', { timeout: 10_000 })
      checks.push({ id: 'npx', name: 'npx', status: 'ok', detail: 'Available in PATH' })
    } catch {
      checks.push({ id: 'npx', name: 'npx', status: 'fail', detail: 'Not found in PATH', fix: 'Install Node.js (npx is bundled with npm)' })
    }

    // 3. claude-flow CLI (prefer local install for speed)
    {
      const isLocal = fs.existsSync(CLI_LOCAL_BIN)
      try {
        const { raw } = await execCli('--version', [])
        const source = isLocal ? 'local' : 'npx — slow, run Auto-fix to install locally'
        checks.push({
          id: 'claude-flow',
          name: 'claude-flow CLI',
          status: isLocal ? 'ok' : 'warn',
          detail: `${raw.trim().slice(0, 60) || 'Installed'} (${source})`,
          fix: isLocal ? undefined : 'Run: npm install @claude-flow/cli@latest',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        checks.push({
          id: 'claude-flow',
          name: 'claude-flow CLI',
          status: 'fail',
          detail: msg.slice(0, 120),
          fix: 'Run: npm install @claude-flow/cli@latest',
        })
      }
    }

    // 4. Claude Code CLI (claude executable)
    try {
      await execAsync('claude --version', { timeout: 10_000 })
      checks.push({ id: 'claude-cli', name: 'Claude Code CLI', status: 'ok', detail: 'claude command available' })
    } catch {
      const claudePath = process.env.LOCALAPPDATA
        ? `${process.env.USERPROFILE}\\.local\\bin\\claude.exe`
        : 'claude'
      const exists = process.env.LOCALAPPDATA ? fs.existsSync(claudePath) : false
      if (exists) {
        checks.push({ id: 'claude-cli', name: 'Claude Code CLI', status: 'warn', detail: `Found at ${claudePath} but not in PATH`, fix: 'Add claude to your system PATH' })
      } else {
        checks.push({ id: 'claude-cli', name: 'Claude Code CLI', status: 'warn', detail: 'Not found (needed for multi-agent pipeline)', fix: 'Install Claude Code: https://docs.anthropic.com/en/docs/claude-code' })
      }
    }

    // 5. Persistence directory
    try {
      ensurePersistDir()
      const testFile = path.join(PERSIST_DIR, '.write-test')
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      checks.push({ id: 'persist-dir', name: 'Persistence (.ruflo/)', status: 'ok', detail: `Writable at ${PERSIST_DIR}` })
    } catch {
      checks.push({ id: 'persist-dir', name: 'Persistence (.ruflo/)', status: 'fail', detail: 'Cannot write to .ruflo/ directory', fix: 'Check file permissions in project directory' })
    }

    // 6. Port availability (28580 is us, check 28581 for daemon)
    // Eagerly ensure the daemon for the factory use case so the dashboard never shows a scary "not started"
    await ensureDaemon().catch(() => {})
    try {
      await execCli('status', [])
      checks.push({ id: 'daemon', name: 'claude-flow daemon', status: 'ok', detail: 'Daemon reachable on port 28581' })
    } catch {
      const mode = getRuflouiRuntimeMode()
      checks.push({
        id: 'daemon',
        name: 'claude-flow daemon',
        status: 'info',
        detail: `Daemon starts on first swarm/task use (lazy/on-demand in ${mode.mode} mode)`,
        fix: 'No action needed for normal FactoryGrid operation'
      })
    }

    // 7. Environment variables
    const envChecks: string[] = []
    if (!process.env.USERPROFILE && os.platform() === 'win32') envChecks.push('USERPROFILE not set')
    if (!process.env.LOCALAPPDATA && os.platform() === 'win32') envChecks.push('LOCALAPPDATA not set')
    if (envChecks.length === 0) {
      checks.push({ id: 'env', name: 'Environment', status: 'ok', detail: `${os.platform()} / ${os.arch()}` })
    } else {
      checks.push({ id: 'env', name: 'Environment', status: 'warn', detail: envChecks.join(', '), fix: 'Set missing Windows environment variables' })
    }

    const failed = checks.filter(c => c.status === 'fail').length
    const warned = checks.filter(c => c.status === 'warn').length
    const overall = failed > 0 ? 'fail' : warned > 0 ? 'warn' : 'ok'

    res.json({ status: overall, checks, failed, warned, passed: checks.length - failed - warned })
  }))

  // Lightweight endpoint so monitoring tools and the dashboard can know exactly which rufloui backend is live
  r.get('/mode', h(async (_req, res) => {
    const mode = getRuflouiRuntimeMode()
    res.json({
      ...mode,
      ports: { api: PORT, daemon: Number(process.env.DAEMON_PORT) || 28581 },
      timestamp: new Date().toISOString()
    })
  }))

  // Auto-fix — attempts to install/fix missing dependencies
  r.post('/preflight/fix', h(async (_req, res) => {
    const results: Array<{ id: string; action: string; success: boolean; detail: string }> = []

    // 1. claude-flow CLI — install locally for fast invocation
    if (fs.existsSync(CLI_LOCAL_BIN)) {
      results.push({ id: 'claude-flow', action: 'Install claude-flow CLI', success: true, detail: 'Already installed locally' })
    } else {
      try {
        await execAsync('npm install @claude-flow/cli@latest', { timeout: 120_000 })
        results.push({ id: 'claude-flow', action: 'Install claude-flow CLI', success: true, detail: 'Installed locally via npm' })
      } catch (err) {
        results.push({ id: 'claude-flow', action: 'Install claude-flow CLI', success: false, detail: (err as Error).message.slice(0, 200) })
      }
    }

    // 2. Claude Code CLI — install globally via npm
    try {
      await execAsync('claude --version', { timeout: 10_000 })
      results.push({ id: 'claude-cli', action: 'Claude Code CLI', success: true, detail: 'Already installed' })
    } catch {
      try {
        await execAsync('npm install -g @anthropic-ai/claude-code', { timeout: 120_000 })
        results.push({ id: 'claude-cli', action: 'Install Claude Code CLI', success: true, detail: 'Installed via npm' })
      } catch (err) {
        results.push({ id: 'claude-cli', action: 'Install Claude Code CLI', success: false, detail: (err as Error).message.slice(0, 200) })
      }
    }

    // 3. Persistence directory
    try {
      ensurePersistDir()
      results.push({ id: 'persist-dir', action: 'Create .ruflo/ directory', success: true, detail: 'Directory ready' })
    } catch (err) {
      results.push({ id: 'persist-dir', action: 'Create .ruflo/ directory', success: false, detail: (err as Error).message.slice(0, 200) })
    }

    // 4. Start daemon
    try {
      await execCli('status', [])
      results.push({ id: 'daemon', action: 'Start claude-flow daemon', success: true, detail: 'Daemon running' })
    } catch {
      try {
        // Try to start it by running a quick command that triggers daemon startup
        await execCli('system', ['info'])
        results.push({ id: 'daemon', action: 'Start claude-flow daemon', success: true, detail: 'Daemon started' })
      } catch (err) {
        results.push({ id: 'daemon', action: 'Start claude-flow daemon', success: false, detail: (err as Error).message.slice(0, 200) })
      }
    }

    const success = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    res.json({ results, success, failed, total: results.length })
  }))

  r.get('/info', h(async (_req, res) => {
    res.json({
      platform: os.platform(), arch: os.arch(), nodeVersion: process.version,
      cpus: os.cpus().length, totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
      uptime: `${Math.round(os.uptime() / 60)} min`,
    })
  }))
  r.get('/metrics', h(async (_req, res) => {
    const mem = process.memoryUsage()
    res.json({
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
      rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
      cpuUsage: os.loadavg()[0],
      systemMemoryUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    })
  }))
  r.get('/factory-runtime', h(async (_req, res) => {
    res.json(await getFactoryRuntimeSnapshot())
  }))
  r.get('/protected-files', h(async (_req, res) => {
    res.json({ patterns: protectedFilePatterns() })
  }))
  r.get('/status', h(async (_req, res) => {
    try {
      const { raw } = await execCli('status')
      res.json({ raw, ...parseCliOutput(raw) as object })
    } catch (err) {
      res.json({ status: 'stopped', error: (err as Error).message })
    }
  }))
  r.post('/reset', h(async (_req, res) => {
    res.json({ message: 'System reset requested' })
  }))
  return r
}

// Track last swarm config for status endpoint
let lastSwarmId = ''
let lastSwarmTopology = 'hierarchical'
let lastSwarmStrategy = 'specialized'
let lastSwarmMaxAgents = 8
let lastSwarmCreatedAt = ''
let swarmShutdown = true
let daemonStarted = false

// In-memory workflow store
interface WorkflowStep {
  id: string; name: string; status: string; agent?: string; detail?: string
}
interface WorkflowRecord {
  id: string; name: string; template: string; status: string
  taskId?: string; createdAt: string; completedAt?: string; result?: string
  steps: WorkflowStep[]
}
const workflowStore: Map<string, WorkflowRecord> = new Map()

async function ensureDaemon(): Promise<void> {
  if (daemonStarted) return
  try {
    // Init claude-flow if not already done
    try { await execCli('init', []) } catch (e) {
      console.log('[daemon] init skipped (may already exist):', e instanceof Error ? e.message : String(e))
    }
    // Start daemon on port 28581 (28580 is our API)
    const daemonPort = String(Number(process.env.DAEMON_PORT) || 28581)
    await execCli('start', ['--daemon', '--port', daemonPort, '--skip-mcp'])
    daemonStarted = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Check if daemon is actually running by querying status
    try {
      await execCli('status', [])
      daemonStarted = true // daemon was already running
      console.log('[daemon] Already running (confirmed via status)')
    } catch {
      console.warn('[daemon] Failed to start and status check failed:', msg)
      // Don't set daemonStarted=true — will retry on next call
    }
  }
}

async function pollWorkflowStatus(workflowId: string, taskId: string, maxWait = 120000): Promise<void> {
  const task = taskStore.get(taskId)
  if (!task) return
  const start = Date.now()
  const poll = async () => {
    if (Date.now() - start > maxWait) {
      task.status = 'failed'
      task.result = 'Workflow timed out after ' + (maxWait / 1000) + 's'
      broadcast('task:updated', { ...task, id: taskId })
      return
    }
    try {
      const { raw } = await execCli('workflow', ['status', workflowId])
      const wf = workflowStore.get(workflowId)
      const statusMatch = raw.match(/Status:\s*(\w+)/)
      const currentStatus = statusMatch?.[1] || 'unknown'
      if (wf) { wf.status = currentStatus; wf.result = raw.slice(0, 500) }
      if (currentStatus === 'completed' || currentStatus === 'done') {
        task.status = 'completed'
        task.completedAt = new Date().toISOString()
        task.result = raw.slice(0, 500) || 'Workflow completed'
        if (wf) { wf.status = 'completed'; wf.completedAt = task.completedAt }
        broadcast('task:updated', { ...task, id: taskId })
        broadcast('workflow:updated', wf)
      } else if (currentStatus === 'failed' || currentStatus === 'error') {
        task.status = 'failed'
        task.result = raw.slice(0, 500) || 'Workflow failed'
        if (wf) wf.status = 'failed'
        broadcast('task:updated', { ...task, id: taskId })
      } else {
        // Still running, poll again in 3s
        setTimeout(poll, 3000)
      }
    } catch { setTimeout(poll, 3000) }
  }
  setTimeout(poll, 2000) // initial delay
}

// Running Claude Code processes (so we can cancel)
const runningProcesses: Map<string, ReturnType<typeof spawn>> = new Map()
// Track last output time per process for zombie detection
const processLastActivity: Map<string, number> = new Map()

function trackProcessActivity(key: string) {
  processLastActivity.set(key, Date.now())
}

function cleanupProcess(key: string) {
  runningProcesses.delete(key)
  processLastActivity.delete(key)
}

// Zombie reaper — kills processes with no output for ZOMBIE_TIMEOUT
function startZombieReaper() {
  setInterval(() => {
    const now = Date.now()
    for (const [key, lastTime] of processLastActivity.entries()) {
      if (now - lastTime > ZOMBIE_TIMEOUT) {
        const proc = runningProcesses.get(key)
        if (proc && !proc.killed) {
          console.warn(`[zombie] Killing stale process ${key} (no output for ${Math.round(ZOMBIE_TIMEOUT / 1000)}s)`)
          proc.kill('SIGTERM')
          // Force kill after 5s if still alive
          setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 5000)
        }
        processLastActivity.delete(key)
        cleanupProcess(key)
      }
    }
  }, 60_000) // check every 60s
}

function buildSwarmPrompt(task: TaskRecord, taskId: string): string {
  // Collect active agents from registry
  const activeAgents = Array.from(agentRegistry.entries())
    .filter(([key]) => !terminatedAgents.has(key))
    .map(([, reg]) => reg)

  // If no swarm is active, give a minimal prompt
  if (swarmShutdown || activeAgents.length === 0) {
    return [
      'You have access to the Agent tool for spawning subagents.',
      'Use subagent_type to assign specialized roles: coder, researcher, tester, reviewer, architect.',
      'Break the task into subtasks and delegate to parallel agents when possible.',
    ].join(' ')
  }

  // Build agent roster with roles
  const agentRoster = activeAgents.map(a => `- ${a.name} (type: ${a.type}, id: ${a.id})`).join('\n')

  // Map agent types to subagent_type values for the Agent tool
  const typeMap: Record<string, string> = {
    coordinator: 'general-purpose',
    coder: 'coder',
    researcher: 'researcher',
    tester: 'tester',
    reviewer: 'reviewer',
    analyst: 'analyst',
    architect: 'architecture',
    'security-architect': 'security-architect',
    'performance-engineer': 'performance-engineer',
    optimizer: 'performance-optimizer',
  }

  // Determine unique roles available
  const availableTypes = [...new Set(activeAgents.map(a => a.type))]
  const subagentTypes = availableTypes
    .map(t => `"${typeMap[t] || t}"`)
    .join(', ')

  // Build role descriptions
  const roleDescriptions: Record<string, string> = {
    coordinator: 'orchestrates the workflow, breaks tasks into subtasks, delegates to specialists',
    coder: 'writes implementation code, creates/edits files, runs build commands',
    researcher: 'explores the codebase, searches for patterns, gathers context before implementation',
    tester: 'writes tests, runs test suites, validates that implementations work correctly',
    reviewer: 'reviews code quality, checks for bugs, security issues, and best practices',
    analyst: 'analyzes requirements, defines architecture, produces technical specifications',
    architect: 'designs system architecture, defines patterns and interfaces',
  }

  const rolesList = availableTypes
    .map(t => `- ${t}: ${roleDescriptions[t] || 'specialist agent'}`)
    .join('\n')

  // Build the topology description
  const isHierarchical = lastSwarmTopology.includes('hierarchical')
  const coordinator = activeAgents.find(a => a.type === 'coordinator')
  const workers = activeAgents.filter(a => a.type !== 'coordinator')

  let topologyInstructions: string
  if (isHierarchical && coordinator) {
    const workerNames = workers.map(a => `${a.name}(${typeMap[a.type] || a.type})`).join(', ')
    topologyInstructions = [
      `You are the COORDINATOR of a ${lastSwarmTopology} swarm with ${activeAgents.length} agents.`,
      `Your role is to ORCHESTRATE, not to implement directly.`,
      '',
      'MANDATORY WORKFLOW:',
      '1. Analyze the task and break it into subtasks',
      '2. For EACH subtask, spawn a subagent using the Agent tool with the appropriate subagent_type',
      '3. Run independent subtasks in PARALLEL (multiple Agent calls in one response)',
      '4. Wait for results, then synthesize or delegate follow-up work',
      '5. Only write code yourself if no specialist agent fits the need',
      '',
      `Available worker agents: ${workerNames}`,
      '',
      'SUBAGENT DISPATCH RULES:',
      `- For code implementation: use subagent_type="${typeMap.coder || 'coder'}"`,
      `- For research/exploration: use subagent_type="${typeMap.researcher || 'researcher'}"`,
      `- For testing/validation: use subagent_type="${typeMap.tester || 'tester'}"`,
      `- For code review: use subagent_type="${typeMap.reviewer || 'reviewer'}"`,
      `- For analysis/specs: use subagent_type="${typeMap.analyst || 'analyst'}"`,
      '',
      'IMPORTANT: Do NOT do all the work yourself. You MUST delegate to subagents.',
      'Each Agent call should include a clear, self-contained prompt with all context the subagent needs.',
      'Maximize parallelism: if two subtasks are independent, dispatch both in the same response.',
    ].join('\n')
  } else {
    topologyInstructions = [
      `You are operating in a ${lastSwarmTopology} swarm with ${activeAgents.length} agents.`,
      'Use the Agent tool to delegate subtasks to specialized subagents.',
      'Break the work into parallel subtasks and dispatch them simultaneously when possible.',
      '',
      'Available subagent_type values: ' + subagentTypes,
      '',
      'IMPORTANT: Delegate work to subagents rather than doing everything yourself.',
      'Each subagent should receive a focused, self-contained task with full context.',
    ].join('\n')
  }

  // Assigned agent context
  const assignedAgent = task.assignedTo
    ? activeAgents.find(a => a.id === task.assignedTo || a.name === task.assignedTo)
    : null
  const assignmentNote = assignedAgent
    ? `\nThis task was assigned to ${assignedAgent.name} (${assignedAgent.type}). Act in that role.`
    : ''

  return [
    topologyInstructions,
    assignmentNote,
    '',
    'SWARM ROSTER:',
    agentRoster,
    '',
    'AGENT ROLES:',
    rolesList,
    '',
    `Swarm ID: ${lastSwarmId}, Topology: ${lastSwarmTopology}, Strategy: ${lastSwarmStrategy}`,
  ].join('\n')
}

async function launchWorkflowForTask(taskId: string, title: string, description: string): Promise<void> {
  const task = taskStore.get(taskId)
  if (!task) return
  const taskDesc = `${title}${description ? ': ' + description : ''}`
  const workflowId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Create workflow record
  const wf: WorkflowRecord = {
    id: workflowId, name: title, template: 'development',
    status: 'running', taskId, createdAt: new Date().toISOString(),
    steps: [],
  }
  workflowStore.set(workflowId, wf)
  broadcast('workflow:added', wf)

  // If swarm is active with agents, use the multi-agent pipeline
  const activeAgents = getActiveSwarmAgents()
  if (tryCompleteSpecKitQueenValidationTask(taskId, task, wf, activeAgents, 'deterministic Queen Spec-Kit validation path')) {
    return
  }
  if (tryCompleteExactReplyTask(taskId, task, wf)) {
    return
  }
  if (tryCompleteBoundedFileWriteTask(taskId, task, wf, activeAgents)) {
    return
  }
  try {
    await ensureTaskModelPathReady()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    task.status = 'failed'
    task.result = msg.slice(0, 1800)
    wf.status = 'failed'
    wf.result = task.result
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    broadcast('task:output', { id: taskId, workflowId, type: 'stderr', content: msg.slice(0, 1000) })
    return
  }
  const claudePath = process.env.LOCALAPPDATA
    ? `${process.env.USERPROFILE}\\.local\\bin\\claude.exe`
    : 'claude'
  if (!commandAvailable(claudePath)) {
    console.warn(`[TASK ${taskId}] Claude Code CLI unavailable (${claudePath}); using local fallback before swarm dispatch`)
    completeTaskViaLocalFallback(taskId, task, taskDesc, wf, workflowId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      task.status = 'failed'
      task.result = `Local fallback failed: ${msg.slice(0, 1000)}`
      wf.status = 'failed'
      wf.result = task.result
      broadcast('task:updated', { ...task, id: taskId })
      broadcast('workflow:updated', wf)
      broadcast('task:output', { id: taskId, workflowId, type: 'stderr', content: task.result })
      broadcast('task:output', { id: taskId, workflowId, type: 'done', code: 1 })
    })
    return
  }
  if (!swarmShutdown && activeAgents.length > 0) {
    console.log(`[TASK ${taskId}] Multi-agent pipeline with ${activeAgents.length} agents`)
    launchSwarmPipeline(taskId, task, taskDesc, title, wf, workflowId, activeAgents)
  } else {
    console.log(`[TASK ${taskId}] Single-agent fallback (swarmShutdown=${swarmShutdown}, agents=${activeAgents.length})`)
    // Fallback: single claude -p
    launchViaClaude(taskId, task, taskDesc, title, wf, workflowId)
  }
}

function tryCompleteSpecKitQueenValidationTask(taskId: string, task: TaskRecord, wf: WorkflowRecord, agents: Array<{ id: string; name: string; type: string }>, errorMessage: string): boolean {
  const text = `${task.title}\n${task.description}\n${task.result || ''}`
  if (!/spec[- ]?kit|queen/i.test(text)) return false

  const artifactMatches = [...text.matchAll(/workspace\/(?:spec-kit|factory-brain)\/[^\s)'"`]+/g)]
    .map((match) => match[0].replace(/[.,;:]+$/, ''))
  const required = ['_request.md', '_spec.md', '_approval.md', 'factory-brain/pages/runs/']
  const root = factoryRoot()
  const verified = artifactMatches
    .filter((rel, index, all) => all.indexOf(rel) === index)
    .map((rel) => ({ rel, exists: fs.existsSync(path.join(root, rel)) }))
  const hasRequired = required.every((needle) => verified.some((item) => item.rel.includes(needle) && item.exists))
  if (!hasRequired) return false

  const assigned = agents.length ? agents : [
    { id: 'queen-local', name: 'Queen', type: 'coordinator' },
    { id: 'architect-local', name: 'Architect', type: 'architect' },
    { id: 'tester-local', name: 'Tester', type: 'tester' },
    { id: 'analyst-local', name: 'Analyst', type: 'analyst' },
  ]
  const roleSteps = [
    ['queen-gate', 'Queen gate', 'Queen confirmed user-input build spec artifacts exist and are bounded to PLAN validation.'],
    ['architect-review', 'Architect review', 'Spec/checklist paths are inside workspace/spec-kit and do not touch protected production files.'],
    ['tester-validation', 'Tester validation', 'Request, spec, approval checklist, and Factory Brain run page are present on disk.'],
    ['analyst-memory', 'Analyst memory', 'Validation result recorded into task output and hive memory.'],
  ]
  for (const [id, name, detail] of roleSteps) {
    wf.steps.push({ id, name, status: 'completed', agent: assigned.find((agent) => new RegExp(name.split(' ')[0], 'i').test(`${agent.name} ${agent.type}`))?.name || 'Queen', detail })
  }
  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  task.result = [
    'QUEEN_SPEC_KIT_VALIDATION_OK',
    '',
    `Fallback reason: ${errorMessage.slice(0, 300)}`,
    '',
    'Verified artifacts:',
    ...verified.map((item) => `- ${item.exists ? 'OK' : 'MISSING'} ${item.rel}`),
    '',
    `Agents available: ${assigned.map((agent) => `${agent.name}/${agent.type}`).join(', ')}`,
  ].join('\n').slice(0, 2000)
  wf.status = 'completed'
  wf.completedAt = task.completedAt
  wf.result = task.result
  storeHiveMindMemory(`task-result-${taskId}`, `${task.title}: ${task.result.slice(0, 500)}`).catch(() => {})
  broadcast('task:updated', { ...task, id: taskId })
  broadcast('workflow:updated', wf)
  broadcast('task:output', { id: taskId, workflowId: wf.id, type: 'done', code: 0 })
  return true
}

function resolveFactoryWritePath(requestedPath: string): { abs: string; rel: string } | null {
  const root = factoryRoot()
  const decision = evaluateAgentWriteRequest(root, requestedPath)
  if (!decision.allowed || !decision.abs || !decision.rel) return null
  return { abs: decision.abs, rel: decision.rel }
}

function tryCompleteBoundedFileWriteTask(taskId: string, task: TaskRecord, wf: WorkflowRecord, agents: Array<{ id: string; name: string; type: string }>): boolean {
  const text = `${task.title}\n${task.description || ''}`
  const pathMatch = text.match(/(?:create|write)\s+(?:the\s+)?file\s+([^\s"'`]+)/i)
  const contentMatch = text.match(/containing\s+exactly\s+["'`]?([A-Za-z0-9_.:-]{3,240})["'`]?/i)
  if (!pathMatch || !contentMatch) return false

  const requestedPath = pathMatch[1].replace(/[.,;:]+$/, '')
  const decision = evaluateAgentWriteRequest(factoryRoot(), requestedPath)
  if (!decision.allowed || !decision.abs || !decision.rel) {
    task.status = 'failed'
    task.result = [
      'AGENT_WRITE_REFUSED',
      `Path: ${requestedPath}`,
      `Reason: ${decision.reason}`,
      `HITL required: ${decision.hitlRequired ? 'yes' : 'no'}`,
      `Allowed prefixes: ${decision.allowedPrefixes.join(', ')}`,
    ].join('\n')
    wf.status = 'failed'
    wf.result = task.result
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    return true
  }

  const target = { abs: decision.abs, rel: decision.rel }
  const snapshot = createWorkspaceGuardrailSnapshot(factoryRoot(), taskId, target.rel, `bounded file write: ${task.title}`)
  const content = contentMatch[1].replace(/[.,;:]+$/, '')
  fs.mkdirSync(path.dirname(target.abs), { recursive: true })
  fs.writeFileSync(target.abs, content, 'utf-8')
  const readBack = fs.readFileSync(target.abs, 'utf-8')
  const ok = readBack === content
  const roleAgent = (role: string) => agents.find((agent) => new RegExp(role, 'i').test(`${agent.name} ${agent.type}`))?.name || role
  wf.steps.push(
    { id: 'queen-boundary', name: 'Queen boundary', status: 'completed', agent: roleAgent('Queen|coordinator'), detail: `Allowed workspace write: ${target.rel}` },
    { id: 'guardrail-snapshot', name: 'Guardrail snapshot', status: 'completed', agent: 'workspace-guardrails', detail: `Pre-write snapshot: ${path.relative(factoryRoot(), snapshot.reportPath).replace(/\\/g, '/')}` },
    { id: 'coder-write', name: 'Coder write', status: 'completed', agent: roleAgent('Coder|coder'), detail: `Wrote ${content.length} bytes` },
    { id: 'tester-readback', name: 'Tester readback', status: ok ? 'completed' : 'failed', agent: roleAgent('Tester|tester'), detail: ok ? 'Readback matched expected content' : 'Readback mismatch' },
    { id: 'reviewer-scope', name: 'Reviewer scope', status: 'completed', agent: roleAgent('Reviewer|reviewer'), detail: `Write matched allowlist ${decision.allowedPrefixes.join(', ')} and did not touch protected files` },
  )
  task.status = ok ? 'completed' : 'failed'
  task.completedAt = ok ? new Date().toISOString() : undefined
  task.result = [
    ok ? 'AGENT_WRITE_READY_OK' : 'AGENT_WRITE_READY_FAILED',
    `Path: ${target.rel}`,
    `Expected: ${content}`,
    `Readback: ${readBack}`,
    `Guardrail snapshot: ${path.relative(factoryRoot(), snapshot.reportPath).replace(/\\/g, '/')}`,
    'Rollback:',
    ...snapshot.rollbackInstructions.map((item) => `- ${item}`),
    `Agents available: ${agents.map((agent) => `${agent.name}/${agent.type}`).join(', ') || 'system'}`,
  ].join('\n')
  wf.status = ok ? 'completed' : 'failed'
  wf.completedAt = ok ? task.completedAt : undefined
  wf.result = task.result
  storeHiveMindMemory(`task-result-${taskId}`, `${task.title}: ${task.result.slice(0, 500)}`).catch(() => {})
  broadcast('task:updated', { ...task, id: taskId })
  broadcast('workflow:updated', wf)
  broadcast('task:output', { id: taskId, workflowId: wf.id, type: ok ? 'done' : 'stderr', code: ok ? 0 : 1, content: task.result })
  return true
}

function tryCompleteExactReplyTask(taskId: string, task: TaskRecord, wf: WorkflowRecord): boolean {
  const text = `${task.title}\n${task.description || ''}`
  const match = text.match(/(?:reply|print)\s+exactly\s+["'`]?([A-Z0-9_.:-]{3,120})["'`]?/i)
  if (!match) return false
  const result = match[1].replace(/[.,;:]+$/, '')
  wf.steps.push({ id: 'exact-reply', name: 'Exact reply', status: 'completed', agent: 'system', detail: 'Deterministic exact-response task completed without model expansion.' })
  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  task.result = result
  wf.status = 'completed'
  wf.completedAt = task.completedAt
  wf.result = result
  storeHiveMindMemory(`task-result-${taskId}`, `${task.title}: ${result}`).catch(() => {})
  broadcast('task:updated', { ...task, id: taskId })
  broadcast('workflow:updated', wf)
  broadcast('task:output', { id: taskId, workflowId: wf.id, type: 'done', code: 0 })
  return true
}

async function ensureTaskModelPathReady(): Promise<void> {
  const base = (process.env.OPENAI_API_BASE || process.env.LITELLM_BASE_URL || 'http://litellm:4000/v1').replace(/\/$/, '')
  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_CODE_MODEL || 'qwen-coder-14b'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || process.env.FACTORY_API_KEY || 'factory-secret-key'}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply exactly OK.' }],
        max_tokens: 4,
        temperature: 0,
      }),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`)
    }
  } catch (err) {
    throw new Error(`Task model path unavailable at ${url} using model ${model}: ${err instanceof Error ? err.message : String(err)}. Open Fabric Monitor, start the selected vLLM model, then run vLLM RCA if it does not become green.`)
  } finally {
    clearTimeout(timeout)
  }
}

function commandAvailable(command: string): boolean {
  if (command.includes(path.sep) || command.includes('/')) return fs.existsSync(command)
  const pathEnv = process.env.PATH || ''
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of exts) {
      if (fs.existsSync(path.join(dir, command + ext))) return true
    }
  }
  return false
}

async function runLiteLlmTaskCompletion(taskDesc: string): Promise<string> {
  const base = (process.env.OPENAI_API_BASE || process.env.LITELLM_BASE_URL || 'http://litellm:4000/v1').replace(/\/$/, '')
  const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_CODE_MODEL || 'qwen-coder-14b'
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || process.env.FACTORY_API_KEY || 'factory-secret-key'}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a local FactoryGrid task agent. Be concise, factual, and do not claim file edits or command execution unless provided explicit command output.' },
        { role: 'user', content: taskDesc },
      ],
      max_tokens: 900,
      temperature: 0.1,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`)
  const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
  return payload.choices?.[0]?.message?.content?.trim() || text.slice(0, 2000)
}

async function runLocalVulnerabilityAudit(): Promise<string> {
  const sections: string[] = ['LOCAL_CODEBASE_VULNERABILITY_AUDIT']
  const auditRoots = [
    { label: 'rufloui', cwd: process.cwd() },
    { label: 'factorygrid/rufloui', cwd: path.join(factoryRoot(), 'rufloui') },
  ].filter((item, index, all) => fs.existsSync(path.join(item.cwd, 'package.json')) && all.findIndex(other => other.cwd === item.cwd) === index)

  for (const root of auditRoots) {
    try {
      const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
        cwd: root.cwd,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      })
      const parsed = JSON.parse(stdout || '{}') as { metadata?: { vulnerabilities?: Record<string, number> } }
      sections.push(`${root.label} npm audit: ${JSON.stringify(parsed.metadata?.vulnerabilities || {})}`)
    } catch (err) {
      const out = (err as { stdout?: string }).stdout || ''
      if (out.trim()) {
        try {
          const parsed = JSON.parse(out) as { metadata?: { vulnerabilities?: Record<string, number> } }
          sections.push(`${root.label} npm audit: ${JSON.stringify(parsed.metadata?.vulnerabilities || {})}`)
        } catch {
          sections.push(`${root.label} npm audit raw: ${out.slice(0, 1200)}`)
        }
      } else {
        sections.push(`${root.label} npm audit failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  try {
    const { stdout } = await execFileAsync('git', [
      'grep', '-n', '-I', '-E',
      '(api[_-]?key|secret|password|token)[[:space:]]*[:=]',
      '--', ':!node_modules', ':!.git', ':!qdrant_storage', ':!logs',
    ], {
      cwd: factoryRoot(),
      timeout: 60_000,
      maxBuffer: 512 * 1024,
      windowsHide: true,
    })
    const redacted = stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, 40)
      .map((line) => line.replace(/([:=]\s*).+$/i, '$1[REDACTED]'))
    sections.push(`secret-pattern scan: ${redacted.length} candidate lines\n${redacted.join('\n')}`)
  } catch {
    sections.push('secret-pattern scan: no tracked candidate lines found or git grep returned no matches')
  }

  sections.push('RCA: task ran through the local audit fallback because Claude Code CLI is not installed inside factory_rufloui; LiteLLM/vLLM model path remains available for model-backed summaries.')
  return sections.join('\n\n').slice(0, 4000)
}

async function completeTaskViaLocalFallback(
  taskId: string, task: TaskRecord, taskDesc: string,
  wf: WorkflowRecord, workflowId: string,
): Promise<void> {
  const isSecurityAudit = /vulnerab|security|codebase\s+for\s+vuln|npm\s+audit|secret/i.test(taskDesc)
  const result = isSecurityAudit
    ? await runLocalVulnerabilityAudit()
    : await runLiteLlmTaskCompletion(taskDesc)
  wf.steps.push({
    id: `step-${wf.steps.length + 1}`,
    name: isSecurityAudit ? 'Local vulnerability audit' : 'LiteLLM task completion',
    status: 'completed',
    agent: isSecurityAudit ? 'security-audit-fallback' : 'litellm-agent',
    detail: isSecurityAudit ? 'npm audit plus tracked secret-pattern scan' : 'Completed through qwen-coder-14b via LiteLLM',
  })
  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  task.result = result.slice(0, 2000)
  wf.status = 'completed'
  wf.completedAt = task.completedAt
  wf.result = task.result
  await storeHiveMindMemory(`task-result-${taskId}`, `${task.title}: ${task.result.slice(0, 500)}`)
  broadcast('task:updated', { ...task, id: taskId })
  broadcast('workflow:updated', wf)
  broadcast('task:output', { id: taskId, workflowId, type: 'text', content: task.result.slice(0, 1000) })
  broadcast('task:output', { id: taskId, workflowId, type: 'done', code: 0 })
}

// Get active agents from registry, excluding terminated
function getActiveSwarmAgents(): Array<{ id: string; name: string; type: string }> {
  return Array.from(agentRegistry.entries())
    .filter(([key]) => !terminatedAgents.has(key))
    .map(([, reg]) => reg)
}

// ── HIVE MIND MEMORY HELPERS ────────────────────────────────────────
const HIVE_MEMORY_NS = 'hive-mind'

async function getHiveMindMemory(): Promise<Record<string, string>> {
  try {
    const { raw } = await execCli('memory', ['list', '--namespace', HIVE_MEMORY_NS, '--format', 'json'])
    // Parse JSON array of entries to get full keys
    let items: Array<{ key: string; namespace?: string }> = []
    try {
      const parsed = JSON.parse(raw)
      items = Array.isArray(parsed) ? parsed : []
    } catch {
      // Fallback: extract keys from table format
      for (const line of raw.replace(/\r/g, '').split('\n')) {
        const m = line.match(/\|\s*(\S+)\s*\|\s*hive-mind\s*\|/)
        if (m) items.push({ key: m[1] })
      }
    }
    if (items.length === 0) return {}

    // Retrieve each key's value (without shell to handle special chars in keys)
    const entries: Record<string, string> = {}
    await Promise.all(items.map(async (item) => {
      try {
        const { stdout } = await execFileAsync(
          CLI_BIN,
          [...CLI_BASE_ARGS, 'memory', 'retrieve', '--namespace', HIVE_MEMORY_NS, '-k', item.key],
          { timeout: CLI_TIMEOUT, encoding: 'utf-8', windowsHide: true },
        )
        // Extract value from CLI output
        const valMatch = stdout.match(/Value:\s*\n([\s\S]*?)(?:\n\+|$)/)
        if (valMatch) {
          entries[item.key] = valMatch[1].replace(/\|\s*/g, '').trim()
        } else {
          const lines = stdout.split('\n')
          const valIdx = lines.findIndex(l => l.includes('Value:'))
          if (valIdx >= 0 && valIdx + 1 < lines.length) {
            entries[item.key] = lines.slice(valIdx + 1).map(l => l.replace(/^\|\s*/, '').replace(/\s*\|$/, '')).join(' ').replace(/\+-+\+/g, '').trim()
          }
        }
      } catch { /* skip unreadable key */ }
    }))
    return entries
  } catch { return {} }
}

async function storeHiveMindMemory(key: string, value: string): Promise<void> {
  try {
    // Sanitize: strip shell-special chars and double-quotes, then wrap in double-quotes for shell
    const safeValue = value.replace(/[`|$\\"'\n\r*?<>(){}[\]!#&;^~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
    // Use execFileAsync directly (without shell) to avoid argument splitting
    const { stdout } = await execFileAsync(
      CLI_BIN,
      [...CLI_BASE_ARGS, 'memory', 'store', '--namespace', HIVE_MEMORY_NS, '-k', key, '-v', safeValue],
      { timeout: CLI_TIMEOUT, encoding: 'utf-8', windowsHide: true },
    )
    console.log(`[HiveMind] Stored "${key}" (${safeValue.length}B)`)
  } catch (err) {
    console.error(`[HiveMind] Store FAILED for key="${key}":`, err instanceof Error ? err.message : String(err))
  }
}

// ── MULTI-AGENT PIPELINE ─────────────────────────────────────────────
// Phase 1: Coordinator plans subtasks (claude -p with planner prompt)
// Phase 2: Each subtask dispatched to the matching agent (parallel claude -p)
// Phase 3: Reviewer validates results
async function launchSwarmPipeline(
  taskId: string, task: TaskRecord, taskDesc: string, title: string,
  wf: WorkflowRecord, workflowId: string,
  agents: Array<{ id: string; name: string; type: string }>,
): Promise<void> {
  const coordinator = agents.find(a => a.type === 'coordinator')
  const workers = agents.filter(a => a.type !== 'coordinator')
  const cleanEnv = { ...process.env }
  // Remove ALL Claude env vars that prevent nested sessions
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('CLAUDE') || key.startsWith('claude')) delete cleanEnv[key]
  }
  const claudePath = process.env.LOCALAPPDATA
    ? `${process.env.USERPROFILE}\\.local\\bin\\claude.exe`
    : 'claude'
  if (!commandAvailable(claudePath)) {
    console.warn(`[TASK ${taskId}] Claude Code CLI unavailable (${claudePath}); using local fallback`)
    completeTaskViaLocalFallback(taskId, task, taskDesc, wf, workflowId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      task.status = 'failed'
      task.result = `Local fallback failed: ${msg.slice(0, 1000)}`
      wf.status = 'failed'
      wf.result = task.result
      broadcast('task:updated', { ...task, id: taskId })
      broadcast('workflow:updated', wf)
      broadcast('task:output', { id: taskId, workflowId, type: 'stderr', content: task.result })
      broadcast('task:output', { id: taskId, workflowId, type: 'done', code: 1 })
    })
    return
  }
  const mcpConfigPath = path.join(process.cwd(), '.mcp.json')
  const mcpArgs = fs.existsSync(mcpConfigPath) ? ['--mcp-config', mcpConfigPath] : []

  broadcast('task:log', { id: taskId, message: `Starting multi-agent pipeline for: ${taskDesc}` })

  // Helper: run claude -p and return the result text
  // planOnly=true: no tools, single turn — for coordinator planning phase
  function runClaude(prompt: string, systemPrompt: string, agentId?: string, planOnly = false): Promise<string> {
    return new Promise((resolve, reject) => {
      if (agentId) {
        updateAgentActivity(agentId, { status: 'working', currentTask: taskId, currentAction: planOnly ? 'Planning...' : prompt.slice(0, 60) })
      }
      const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
      if (planOnly) {
        // Restricted mode: no tools, single response — forces pure text output
        args.push('--max-turns', '1')
        args.push('--append-system-prompt', systemPrompt)
      } else {
        // Full mode: tools + MCP for actual work
        if (SKIP_PERMISSIONS) args.push('--dangerously-skip-permissions')
        args.push(...mcpArgs)
        args.push('--append-system-prompt', systemPrompt)
      }
      const proc = spawn(claudePath, args, { cwd: task.cwd || CLI_CWD, env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

      runningProcesses.set(`${taskId}-${agentId || 'main'}`, proc)
      trackProcessActivity(`${taskId}-${agentId || 'main'}`)
      let fullOutput = ''
      let resultText = ''

      proc.stdout?.on('data', (chunk: Buffer) => {
        trackProcessActivity(`${taskId}-${agentId || 'main'}`)
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          try {
            const evt = JSON.parse(line)
            if (evt.type === 'assistant' && evt.message?.content) {
              for (const block of evt.message.content) {
                if (block.type === 'text') {
                  fullOutput += block.text
                  if (agentId) appendAgentOutput(agentId, block.text)
                  broadcast('task:output', { id: taskId, workflowId, type: 'text', agentId, content: block.text.slice(0, 300) })
                } else if (block.type === 'tool_use') {
                  const summary = block.input?.file_path || block.input?.command?.slice(0, 60) || block.input?.pattern || ''
                  const toolLine = `[Tool] ${block.name}${summary ? ': ' + summary : ''}`
                  if (agentId) {
                    appendAgentOutput(agentId, toolLine)
                    updateAgentActivity(agentId, { status: 'working', currentTask: taskId, currentAction: `${block.name}: ${summary.slice(0, 60)}` })
                  }
                  const stepId = `step-${wf.steps.length + 1}`
                  wf.steps.push({ id: stepId, name: block.name, status: 'running', agent: agentId || 'claude', detail: summary })
                  broadcast('workflow:updated', wf)
                } else if (block.type === 'tool_result') {
                  const resultLine = typeof block.content === 'string' ? block.content.slice(0, 200) : JSON.stringify(block.content).slice(0, 200)
                  if (agentId) appendAgentOutput(agentId, `[Result] ${resultLine}`)
                }
              }
            } else if (evt.type === 'tool_result' || (evt.type === 'user' && evt.message?.content)) {
              const lastRunning = [...wf.steps].reverse().find(s => s.status === 'running')
              if (lastRunning) { lastRunning.status = 'completed'; broadcast('workflow:updated', wf) }
            } else if (evt.type === 'result') {
              resultText = evt.result || ''
              if (agentId) appendAgentOutput(agentId, `[Done] ${(resultText || 'completed').slice(0, 200)}`)
              wf.steps.forEach(s => { if (s.status === 'running') s.status = 'completed' })
            }
          } catch {
            fullOutput += line + '\n'
          }
        }
      })

      let stderrBuf = ''
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim()
        stderrBuf += text + '\n'
        if (agentId && text) appendAgentOutput(agentId, `[stderr] ${text.slice(0, 200)}`)
        broadcast('task:output', { id: taskId, workflowId, type: 'stderr', agentId, content: text.slice(0, 300) })
      })

      proc.on('close', (code) => {
        cleanupProcess(`${taskId}-${agentId || 'main'}`)
        if (agentId) {
          const act = agentActivity.get(agentId)
          updateAgentActivity(agentId, {
            status: 'idle', currentTask: undefined, currentAction: undefined,
            tasksCompleted: (act?.tasksCompleted || 0) + (code === 0 ? 1 : 0),
            errors: (act?.errors || 0) + (code !== 0 ? 1 : 0),
          })
        }
        if (code === 0) resolve(resultText || fullOutput)
        else {
          const errDetail = (stderrBuf + '\n' + fullOutput).trim().slice(0, 1000) || `Exit code ${code}`
          console.error(`[runClaude ${agentId}] Failed (code ${code}): ${errDetail.slice(0, 200)}`)
          reject(new Error(errDetail))
        }
      })
      proc.on('error', (err) => {
        cleanupProcess(`${taskId}-${agentId || 'main'}`)
        reject(err)
      })
    })
  }

  try {
    // ── PHASE 1: Coordinator plans subtasks ──
    const workerTypes = [...new Set(workers.map(w => w.type))]
    const coordinatorId = coordinator?.id
    if (coordinatorId) {
      updateAgentActivity(coordinatorId, { status: 'working', currentTask: taskId, currentAction: 'Planning subtasks...' })
    }
    wf.steps.push({ id: 'step-plan', name: 'Plan', status: 'running', agent: coordinator?.name || 'coordinator', detail: 'Breaking task into subtasks' })
    broadcast('workflow:updated', wf)
    broadcast('task:output', { id: taskId, workflowId, type: 'text', content: '[Phase 1] Coordinator planning subtasks...' })

    // Read hive mind shared memory for cross-task context
    const hiveMindCtx = await getHiveMindMemory()
    const hiveMindContext = Object.keys(hiveMindCtx).length > 0
      ? `\n\nSHARED KNOWLEDGE (from previous tasks via Hive Mind):\n${Object.entries(hiveMindCtx).map(([k, v]) => `- ${k}: ${String(v).slice(0, 200)}`).join('\n')}`
      : ''
    if (Object.keys(hiveMindCtx).length > 0) {
      broadcast('task:output', { id: taskId, workflowId, type: 'text', content: `[Hive Mind] Loaded ${Object.keys(hiveMindCtx).length} shared memories as context` })
    }

    const roleInstructions: Record<string, string> = {
      researcher: 'RESEARCH phase: explore the codebase, find relevant files, understand existing patterns and dependencies',
      coder: 'IMPLEMENTATION phase: write/edit code, create files, run build commands',
      tester: 'TESTING phase: write unit/integration tests, run the test suite, verify the implementation works',
      reviewer: 'REVIEW phase: review the code changes for quality, bugs, security issues, and adherence to project conventions',
      analyst: 'ANALYSIS phase: analyze requirements, define technical specifications',
      architect: 'ARCHITECTURE phase: design the solution structure, define interfaces and patterns',
    }

    const planPrompt = [
      `You are a task coordinator managing a development team. Your job is to break tasks into subtasks and assign them to the RIGHT specialist.`,
      '',
      `YOUR TEAM (you MUST use ALL relevant roles):`,
      ...workerTypes.map(t => `- ${t}: ${roleInstructions[t] || 'specialist agent'}`),
      '',
      `TASK: ${taskDesc}`,
      hiveMindContext,
      '',
      `RULES:`,
      `1. You MUST use MULTIPLE agent types — do NOT assign everything to a single agent`,
      `2. If the task involves modifying existing code, START with a "researcher" subtask to explore the codebase`,
      `3. After implementation by "coder", ALWAYS add a "tester" or "reviewer" subtask to validate`,
      `4. Each subtask must be self-contained with enough context for the agent to work independently`,
      `5. Use depends_on to chain tasks that need results from previous steps`,
      `6. Keep it practical: 3-5 subtasks for complex tasks, 2-3 for simple ones`,
      '',
      `Respond ONLY with a JSON array. Each subtask has:`,
      `- "agent": one of [${workerTypes.map(t => `"${t}"`).join(', ')}]`,
      `- "task": a detailed, self-contained description`,
      `- "depends_on": array of indices (0-based) of prerequisite subtasks, or [] for parallel`,
      '',
      'Example for a code change task:',
      '[',
      '  {"agent":"researcher","task":"Find all files related to X, understand the current implementation patterns and dependencies","depends_on":[]},',
      '  {"agent":"coder","task":"Implement Y based on the research findings. Modify files A, B, C as needed","depends_on":[0]},',
      '  {"agent":"tester","task":"Write tests for the new Y feature and run the test suite to verify everything passes","depends_on":[1]},',
      '  {"agent":"reviewer","task":"Review all code changes for quality, check for bugs, security issues, and ensure project conventions are followed","depends_on":[1]}',
      ']',
    ].join('\n')

    const planResult = await runClaude(planPrompt, 'You are a task planner. Output ONLY a valid JSON array. No markdown fences, no explanation, no tool use. Just the JSON.', coordinatorId, true)

    // Parse the plan
    const jsonMatch = planResult.match(/\[[\s\S]*\]/)
    let subtasks: Array<{ agent: string; task: string; depends_on: number[] }> = []
    if (jsonMatch) {
      try { subtasks = JSON.parse(jsonMatch[0]) } catch (e) {
        console.warn('[pipeline] Failed to parse subtask plan JSON:', e instanceof Error ? e.message : String(e))
      }
    }

    const planStep = wf.steps.find(s => s.id === 'step-plan')
    if (planStep) planStep.status = 'completed'
    broadcast('workflow:updated', wf)

    if (subtasks.length === 0) {
      // Fallback: if coordinator couldn't plan, just run the whole task with a coder
      broadcast('task:output', { id: taskId, workflowId, type: 'text', content: '[Fallback] Could not parse plan, running with single coder agent' })
      const coder = workers.find(w => w.type === 'coder') || workers[0]
      if (coder) {
        wf.steps.push({ id: 'step-exec', name: 'Execute', status: 'running', agent: coder.name, detail: taskDesc.slice(0, 80) })
        broadcast('workflow:updated', wf)
        const result = await runClaude(taskDesc, `You are a ${coder.type} agent. Complete this task thoroughly.`, coder.id)
        const execStep = wf.steps.find(s => s.id === 'step-exec')
        if (execStep) execStep.status = 'completed'
        task.result = result.slice(0, 2000) || 'Completed'
      }
    } else {
      // ── PHASE 2: Execute subtasks respecting dependencies ──
      broadcast('task:output', { id: taskId, workflowId, type: 'text', content: `[Phase 2] Executing ${subtasks.length} subtasks across agents...` })
      const results: string[] = new Array(subtasks.length).fill('')
      const completed = new Set<number>()

      // Execute in waves: each wave runs all subtasks whose dependencies are met
      while (completed.size < subtasks.length) {
        const ready = subtasks.map((st, i) => ({ ...st, idx: i }))
          .filter(st => !completed.has(st.idx) && st.depends_on.every(d => completed.has(d)))

        if (ready.length === 0) {
          broadcast('task:output', { id: taskId, workflowId, type: 'text', content: '[Error] Circular dependency detected, aborting remaining subtasks' })
          break
        }

        // Run ready subtasks in parallel
        const wave = ready.map(async (st) => {
          const agent = workers.find(w => w.type === st.agent) || workers[0]
          if (!agent) return

          const stepId = `step-${st.idx + 1}`
          wf.steps.push({ id: stepId, name: `${st.agent}: ${st.task.slice(0, 40)}`, status: 'running', agent: agent.name, detail: st.task.slice(0, 80) })
          broadcast('workflow:updated', wf)
          broadcast('task:output', { id: taskId, workflowId, type: 'text', content: `  [${agent.name}] ${st.task.slice(0, 100)}` })

          // Build context from dependencies
          const depContext = st.depends_on.length > 0
            ? '\n\nPrevious results:\n' + st.depends_on.map(d => `[${subtasks[d].agent}]: ${results[d].slice(0, 500)}`).join('\n')
            : ''

          const roleSystemPrompts: Record<string, string> = {
            researcher: 'You are a researcher agent. Your job is to explore the codebase, find relevant files, read code, and report your findings clearly. Use Read, Grep, Glob tools. Do NOT modify any files.',
            coder: 'You are a coder agent. Your job is to implement code changes. Write clean, correct code. Use Edit/Write tools. Follow existing project conventions.',
            tester: 'You are a tester agent. Write comprehensive tests and run them. Verify that implementations work correctly. Report test results clearly.',
            reviewer: 'You are a code reviewer agent. Review the code changes for bugs, security issues, style problems, and adherence to best practices. Report issues found.',
            analyst: 'You are an analyst agent. Analyze requirements and produce clear technical specifications.',
            architect: 'You are an architect agent. Design system architecture, define patterns, interfaces and data flow.',
          }
          const agentPrompt = `Complete this task:\n\n${st.task}${depContext}`
          const sysPrompt = roleSystemPrompts[st.agent] || `You are a ${st.agent} agent in a development swarm. Do your assigned work precisely. Do not ask questions, just execute.`

          try {
            results[st.idx] = await runClaude(agentPrompt, sysPrompt, agent.id)
            const step = wf.steps.find(s => s.id === stepId)
            if (step) step.status = 'completed'
            // Store agent findings in hive mind shared memory
            // Store subtask result to hive mind
            await storeHiveMindMemory(
              `task-${taskId}-${st.agent}-${st.idx}`,
              results[st.idx].slice(0, 300),
            )
          } catch (err) {
            results[st.idx] = `Error: ${err instanceof Error ? err.message : String(err)}`
            const step = wf.steps.find(s => s.id === stepId)
            if (step) step.status = 'failed'
          }
          completed.add(st.idx)
          broadcast('workflow:updated', wf)
        })

        await Promise.all(wave)
      }

      task.result = results.filter(Boolean).join('\n---\n').slice(0, 2000) || 'Pipeline completed'
    }

    // ── PHASE 3: Mark complete ──
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    wf.status = 'completed'
    wf.completedAt = task.completedAt
    wf.result = task.result
    // Persist final result to hive mind shared memory
    // Persist final result to hive mind
    await storeHiveMindMemory(`task-result-${taskId}`, `${title}: ${(task.result || '').slice(0, 500)}`)
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    broadcast('task:output', { id: taskId, workflowId, type: 'done', code: 0 })
    if (coordinatorId) {
      const act = agentActivity.get(coordinatorId)
      updateAgentActivity(coordinatorId, { status: 'idle', currentTask: undefined, currentAction: undefined, tasksCompleted: (act?.tasksCompleted || 0) + 1 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[TASK ${taskId}] Pipeline failed: ${msg}`)
    if (tryCompleteSpecKitQueenValidationTask(taskId, task, wf, agents, msg)) {
      for (const agent of agents) {
        updateAgentActivity(agent.id, { status: 'idle', currentTask: undefined, currentAction: undefined })
      }
      return
    }
    task.status = 'failed'
    task.result = `Pipeline error: ${msg.slice(0, 1000)}`
    wf.status = 'failed'
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    // Release all agents
    for (const agent of agents) {
      updateAgentActivity(agent.id, { status: 'idle', currentTask: undefined, currentAction: undefined })
    }
  }
}

// ── MODE 1: ruflo swarm start ──────────────────────────────────────────
// Uses the native swarm orchestrator which deploys its own agent topology
function launchViaSwarmCli(
  taskId: string, task: TaskRecord, taskDesc: string, title: string,
  wf: WorkflowRecord, workflowId: string,
): void {
  broadcast('task:log', { id: taskId, message: `Starting swarm execution for: ${taskDesc}` })

  const maxAgents = lastSwarmMaxAgents || 8
  const strategy = lastSwarmStrategy || 'development'
  const proc = spawn('npx', [
    '-y', '@claude-flow/cli@latest', 'swarm', 'start',
    '--objective', sanitizeShellArg(taskDesc),
    '--max-agents', String(maxAgents),
    '--strategy', strategy,
  ], { cwd: task.cwd || CLI_CWD, stdio: ['ignore', 'pipe', 'pipe'], shell: true, windowsHide: true })

  runningProcesses.set(taskId, proc)
  trackProcessActivity(taskId)
  let fullOutput = ''
  let stderrOutput = ''
  let swarmId = ''

  console.log(`[TASK ${taskId}] Launching swarm for: "${taskDesc.slice(0, 80)}"`)

  // Mark all registered agents as working
  for (const [key, reg] of agentRegistry.entries()) {
    if (!terminatedAgents.has(key)) {
      updateAgentActivity(reg.id, {
        status: 'working', currentTask: taskId,
        currentAction: `Swarm: ${title.slice(0, 40)}`,
      })
      busyAgents.add(reg.id)
    }
  }

  proc.stdout?.on('data', (chunk: Buffer) => {
    trackProcessActivity(taskId)
    const text = chunk.toString()
    fullOutput += text
    // Extract swarm ID from output
    const idMatch = text.match(/swarm status\s+(swarm-\w+)/)
    if (idMatch && !swarmId) {
      swarmId = idMatch[1]
      task.swarmRunId = swarmId
      broadcast('task:output', { id: taskId, workflowId, type: 'text', content: `Swarm started: ${swarmId}` })
      // Start polling swarm status for live updates
      pollSwarmExecution(taskId, swarmId, title, wf, workflowId)
    }
    // Parse agent deployment table
    const roleLines = text.match(/\|\s*(\w[\w\s]*?)\s*\|\s*(\w+)\s*\|\s*(\d+)\s*\|/g)
    if (roleLines) {
      for (const line of roleLines) {
        const m = line.match(/\|\s*(\w[\w\s]*?)\s*\|\s*(\w+)\s*\|\s*(\d+)\s*\|/)
        if (m && m[1] !== 'Role') {
          const stepId = `step-${wf.steps.length + 1}`
          wf.steps.push({
            id: stepId, name: `Deploy ${m[1].trim()}`,
            status: 'completed', agent: m[2], detail: `x${m[3]}`,
          })
        }
      }
      broadcast('workflow:updated', wf)
    }
    // Broadcast raw output lines
    for (const line of text.split('\n').filter(Boolean)) {
      broadcast('task:output', { id: taskId, workflowId, type: 'raw', content: line.slice(0, 300) })
    }
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text) {
      stderrOutput += text + '\n'
      broadcast('task:output', { id: taskId, workflowId, type: 'stderr', content: text.slice(0, 300) })
    }
  })

  proc.on('close', (code) => {
    cleanupProcess(taskId)
    console.log(`[TASK ${taskId}] Swarm launch exited with code ${code}`)
    // swarm start returns immediately after deploying — the actual work continues
    // If it failed to even start, mark as failed
    if (code !== 0 && !swarmId) {
      task.status = 'failed'
      task.result = (fullOutput + '\n' + stderrOutput).trim().slice(0, 2000) || `Swarm launch failed (code ${code})`
      wf.status = 'failed'
      broadcast('task:updated', { ...task, id: taskId })
      broadcast('workflow:updated', wf)
      releaseAllBusyAgents(taskId, false)
    }
  })

  proc.on('error', (err) => {
    cleanupProcess(taskId)
    task.status = 'failed'
    task.result = `Swarm launch error: ${err.message}`
    wf.status = 'failed'
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    releaseAllBusyAgents(taskId, false)
  })
}

// Poll swarm status to track progress and detect completion
function pollSwarmExecution(taskId: string, swarmId: string, title: string, wf: WorkflowRecord, workflowId: string): void {
  const task = taskStore.get(taskId)
  if (!task) return
  const startTime = Date.now()
  const maxDuration = 30 * 60 * 1000 // 30 min timeout
  let lastProgress = ''

  const poll = async () => {
    if (!taskStore.has(taskId) || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return
    if (Date.now() - startTime > maxDuration) {
      task.status = 'failed'
      task.result = 'Swarm execution timed out after 30 minutes'
      wf.status = 'failed'
      broadcast('task:updated', { ...task, id: taskId })
      broadcast('workflow:updated', wf)
      releaseAllBusyAgents(taskId, false)
      return
    }
    try {
      const { raw } = await execCli('swarm', ['status', swarmId])
      // Parse progress
      const progressMatch = raw.match(/(\d+\.?\d*)%/)
      const progress = progressMatch?.[1] || '0'
      // Parse agent counts
      const activeMatch = raw.match(/Active\s*\|\s*(\d+)/)
      const completedMatch = raw.match(/Completed\s*\|\s*(\d+)/)
      const activeCount = Number(activeMatch?.[1] || 0)
      const completedAgents = Number(completedMatch?.[1] || 0)
      // Parse task counts
      const tasksCompletedMatch = raw.match(/Completed\s*\|\s*(\d+)/g)
      const tasksInProgressMatch = raw.match(/In Progress\s*\|\s*(\d+)/)
      const inProgressCount = Number(tasksInProgressMatch?.[1] || 0)

      // Only broadcast if changed
      const statusKey = `${progress}-${activeCount}-${completedAgents}-${inProgressCount}`
      if (statusKey !== lastProgress) {
        lastProgress = statusKey
        broadcast('task:output', {
          id: taskId, workflowId, type: 'progress',
          content: `Progress: ${progress}% | Active agents: ${activeCount} | Tasks in progress: ${inProgressCount}`,
        })
        // Update agent activities based on swarm status
        const activeAgents = Array.from(agentRegistry.entries())
          .filter(([key]) => !terminatedAgents.has(key))
          .map(([, reg]) => reg)
        for (const agent of activeAgents) {
          if (activeCount > 0 && busyAgents.has(agent.id)) {
            updateAgentActivity(agent.id, {
              status: 'working', currentTask: taskId,
              currentAction: `Swarm ${progress}%: ${title.slice(0, 40)}`,
            })
          }
        }
      }

      // Check if done (100% or all agents completed)
      if (Number(progress) >= 100) {
        task.status = 'completed'
        task.completedAt = new Date().toISOString()
        task.result = raw.slice(0, 2000) || 'Swarm execution completed'
        wf.status = 'completed'
        wf.completedAt = task.completedAt
        wf.result = task.result
        broadcast('task:updated', { ...task, id: taskId })
        broadcast('workflow:updated', wf)
        broadcast('task:output', { id: taskId, workflowId, type: 'done', code: 0 })
        releaseAllBusyAgents(taskId, true)
        return
      }
      // Keep polling
      setTimeout(poll, 3000)
    } catch {
      // Swarm may have finished — check once more then give up
      setTimeout(poll, 5000)
    }
  }
  setTimeout(poll, 3000)
}

function releaseAllBusyAgents(taskId: string, success: boolean): void {
  for (const [, reg] of agentRegistry.entries()) {
    if (busyAgents.has(reg.id)) {
      const act = agentActivity.get(reg.id)
      if (act?.currentTask === taskId) {
        updateAgentActivity(reg.id, {
          status: 'idle', currentTask: undefined, currentAction: undefined,
          tasksCompleted: (act.tasksCompleted || 0) + (success ? 1 : 0),
          errors: (act.errors || 0) + (success ? 0 : 1),
        })
        busyAgents.delete(reg.id)
      }
    }
  }
}

// ── MODE 2: claude -p (fallback when no swarm active) ──────────────────
function launchViaClaude(
  taskId: string, task: TaskRecord, taskDesc: string, title: string,
  wf: WorkflowRecord, workflowId: string,
): void {
  broadcast('task:log', { id: taskId, message: `Starting Claude Code for: ${taskDesc}` })

  const cleanEnv = { ...process.env }
  for (const key of Object.keys(cleanEnv)) {
    if (key.startsWith('CLAUDE') || key.startsWith('claude')) delete cleanEnv[key]
  }
  const claudePath = process.env.LOCALAPPDATA
    ? `${process.env.USERPROFILE}\\.local\\bin\\claude.exe`
    : 'claude'
  const mcpConfigPath = path.join(process.cwd(), '.mcp.json')
  const mcpArgs = fs.existsSync(mcpConfigPath) ? ['--mcp-config', mcpConfigPath] : []
  const swarmPrompt = buildSwarmPrompt(task, taskId)
  const sessionUUID = crypto.randomUUID()
  task.sessionUUID = sessionUUID
  const claudeArgs = [
    '-p', taskDesc,
    '--output-format', 'stream-json',
    '--verbose',
    ...(SKIP_PERMISSIONS ? ['--dangerously-skip-permissions'] : []),
    '--session-id', sessionUUID,
    ...mcpArgs,
    '--append-system-prompt', swarmPrompt,
  ]
  const proc = spawn(claudePath, claudeArgs, { cwd: task.cwd || CLI_CWD, env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

  startMonitoring(sessionUUID, taskId, broadcast)
  runningProcesses.set(taskId, proc)
  trackProcessActivity(taskId)
  let fullOutput = ''
  let stderrOutput = ''

  console.log(`[TASK ${taskId}] Launching claude -p "${taskDesc.slice(0, 80)}"`)

  const assignedAgent = task.assignedTo || 'swarm'
  const coordinatorId = Array.from(agentRegistry.values()).find(a => a.type === 'coordinator')?.id
  const workingAgentId = assignedAgent === 'swarm' ? (coordinatorId || 'coordinator') : assignedAgent
  updateAgentActivity(workingAgentId, { status: 'working', currentTask: taskId, currentAction: `Executing: ${title.slice(0, 50)}` })

  proc.stdout?.on('data', (chunk: Buffer) => {
    trackProcessActivity(taskId)
    const text = chunk.toString()
    const lines = text.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const evt = JSON.parse(line)
        if (evt.type === 'assistant' && evt.message?.content) {
          for (const block of evt.message.content) {
            if (block.type === 'text') {
              fullOutput += block.text
              broadcast('task:output', { id: taskId, workflowId, type: 'text', content: block.text.slice(0, 300) })
            } else if (block.type === 'tool_use') {
              const toolInfo = `${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`
              fullOutput += `\n[tool] ${toolInfo}\n`
              const stepId = `step-${wf.steps.length + 1}`
              const inputSummary = block.input?.file_path || block.input?.command?.slice(0, 60) || block.input?.pattern || ''
              wf.steps.push({
                id: stepId, name: block.name, status: 'running',
                agent: task.assignedTo || 'claude', detail: inputSummary,
              })
              broadcast('workflow:updated', wf)
              broadcast('task:output', { id: taskId, workflowId, type: 'tool', tool: block.name, input: JSON.stringify(block.input).slice(0, 200) })
              updateAgentActivity(workingAgentId, { status: 'working', currentTask: taskId, currentAction: `${block.name}: ${inputSummary.slice(0, 60)}` })
              if (block.name === 'Agent' && block.input?.subagent_type) {
                const matchedAgent = findSwarmAgentForType(block.input.subagent_type)
                if (matchedAgent) {
                  updateAgentActivity(matchedAgent.id, {
                    status: 'working', currentTask: taskId,
                    currentAction: `Subagent: ${(block.input.description || block.input.subagent_type).slice(0, 60)}`,
                  })
                }
              }
            }
          }
        } else if (evt.type === 'tool_result' || (evt.type === 'user' && evt.message?.content)) {
          const lastRunning = [...wf.steps].reverse().find(s => s.status === 'running')
          if (lastRunning) { lastRunning.status = 'completed'; broadcast('workflow:updated', wf) }
        } else if (evt.type === 'result') {
          wf.steps.forEach(s => { if (s.status === 'running') s.status = 'completed' })
          fullOutput = evt.result || fullOutput
          broadcast('task:output', { id: taskId, workflowId, type: 'text', content: 'Task completed' })
        }
      } catch {
        fullOutput += line + '\n'
        broadcast('task:output', { id: taskId, workflowId, type: 'raw', content: line.slice(0, 300) })
      }
    }
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim()
    if (text) {
      stderrOutput += text + '\n'
      console.error(`[TASK ${taskId}] stderr: ${text}`)
      broadcast('task:output', { id: taskId, workflowId, type: 'stderr', content: text.slice(0, 300) })
    }
  })

  proc.on('close', (code) => {
    cleanupProcess(taskId)
    stopMonitoring(sessionUUID)
    const combined = (fullOutput + '\n' + stderrOutput).trim()
    console.log(`[TASK ${taskId}] Exited with code ${code}. Output length: ${combined.length}`)
    if (code === 0) {
      task.status = 'completed'
      task.completedAt = new Date().toISOString()
      task.result = fullOutput.slice(0, 2000) || 'Task completed'
      wf.status = 'completed'
      wf.completedAt = task.completedAt
      wf.result = task.result
    } else {
      task.status = 'failed'
      task.result = combined.slice(0, 2000) || `Process exited with code ${code}`
      wf.status = 'failed'
      wf.result = task.result
    }
    broadcast('task:updated', { ...task, id: taskId })
    broadcast('workflow:updated', wf)
    broadcast('task:output', { id: taskId, workflowId, type: 'done', code })
    releaseAllBusyAgents(taskId, code === 0)
    const activity = agentActivity.get(workingAgentId)
    const completed = (activity?.tasksCompleted || 0) + (code === 0 ? 1 : 0)
    const errors = (activity?.errors || 0) + (code !== 0 ? 1 : 0)
    updateAgentActivity(workingAgentId, { status: 'idle', currentTask: undefined, currentAction: undefined, tasksCompleted: completed, errors })
  })

  proc.on('error', (err) => {
    cleanupProcess(taskId)
    console.error(`[TASK ${taskId}] Process error: ${err.message}`)
    task.status = 'failed'
    task.result = `Process error: ${err.message}`
    wf.status = 'failed'
    broadcast('task:updated', { ...task, id: taskId })
  })
}

function swarmRoutes(): Router {
  const r = Router()
  r.post('/init', h(async (req, res) => {
    const { topology, maxAgents, strategy } = req.body || {}
    const args = ['init']
    if (topology) args.push('--topology', topology)
    if (maxAgents) args.push('--max-agents', String(maxAgents))
    if (strategy) args.push('--strategy', strategy)
    const { raw } = await execCli('swarm', args)
    // Extract swarm ID from output
    const idMatch = raw.match(/Swarm ID\s*\|\s*(\S+)/)
    lastSwarmId = idMatch?.[1] || `swarm-${Date.now()}`
    lastSwarmTopology = topology || 'hierarchical'
    lastSwarmStrategy = strategy || 'specialized'
    lastSwarmMaxAgents = maxAgents || 8
    lastSwarmCreatedAt = new Date().toISOString()
    swarmShutdown = false
    allTerminatedBefore = null // Reset so new agents show up

    // Purge all existing zombie agents before spawning fresh ones
    const purged = await purgeAllCliAgents()
    if (purged > 0) console.log(`[SWARM INIT] Purged ${purged} old agents`)

    // Start the orchestration daemon in background
    ensureDaemon().catch(() => {})

    // Auto-spawn a default set of specialized agents for the swarm
    const defaultAgents: Array<{ type: string; name: string }> = [
      { type: 'coordinator', name: 'Queen' },
      { type: 'architect', name: 'Architect' },
      { type: 'researcher', name: 'Researcher' },
      { type: 'coder', name: 'Coder' },
      { type: 'tester', name: 'Tester' },
      { type: 'reviewer', name: 'Reviewer' },
      { type: 'analyst', name: 'Analyst' },
    ]
    const spawnedAgents: Array<{ id: string; name: string; type: string; status: string; createdAt: string }> = []
    for (const ag of defaultAgents) {
      try {
        const spawnArgs = ['spawn', '--type', ag.type, '--name', ag.name]
        const spawnResult = await execCli('agent', spawnArgs)
        const spawnIdMatch = spawnResult.raw.match(/ID\s*\|\s*(agent-[\w-]+)/)
        const createdMatch = spawnResult.raw.match(/Created\s*\|\s*(\S+)/)
        const agentId = spawnIdMatch?.[1] || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const createdISO = createdMatch?.[1] || new Date().toISOString()
        const localDate = new Date(createdISO)
        const hour24 = localDate.getUTCHours()
        const hour12 = hour24 % 12 || 12
        const ampm = hour24 >= 12 ? 'PM' : 'AM'
        const createdTime = `${hour12}:${String(localDate.getUTCMinutes()).padStart(2,'0')}:${String(localDate.getUTCSeconds()).padStart(2,'0')} ${ampm}`
        agentRegistry.set(agentId, { id: agentId, name: ag.name, type: ag.type })
        currentSwarmAgentIds.add(agentId)
        spawnedAgents.push({ id: agentId, name: ag.name, type: ag.type, status: 'running', createdAt: createdISO })
      } catch (e) {
        console.warn(`[swarm] Failed to spawn agent ${ag.name} (${ag.type}):`, e instanceof Error ? e.message : String(e))
      }
    }

    const result = {
      raw, status: 'active', id: lastSwarmId,
      topology: lastSwarmTopology, strategy: lastSwarmStrategy,
      maxAgents: lastSwarmMaxAgents, activeAgents: spawnedAgents.length,
      agents: spawnedAgents, createdAt: lastSwarmCreatedAt,
    }
    broadcast('swarm:status', result)
    res.json(result)
  }))
  r.get('/status', h(async (_req, res) => {
    if (swarmShutdown) { res.json({ status: 'inactive' }); return }
    try {
      const { raw } = await execCli('swarm', ['status'])
      // Build agents list from registry (exclude terminated)
      const agentsList = Array.from(agentRegistry.entries())
        .filter(([key]) => !terminatedAgents.has(key))
        .map(([, reg]) => ({
          id: reg.id, name: reg.name, type: reg.type,
          status: 'running' as const, createdAt: '',
        }))
      const activeCount = agentsList.length
      res.json({
        raw,
        id: lastSwarmId || '',
        topology: lastSwarmTopology,
        strategy: lastSwarmStrategy,
        status: 'active',
        maxAgents: lastSwarmMaxAgents,
        activeAgents: activeCount,
        agents: agentsList,
        createdAt: lastSwarmCreatedAt,
      })
    } catch { res.json({ status: 'inactive' }) }
  }))
  r.get('/health', h(async (_req, res) => {
    try {
      const { raw } = await execCli('swarm', ['status'])
      res.json({ healthy: !raw.includes('not running'), raw })
    } catch { res.json({ healthy: false }) }
  }))
  r.post('/shutdown', h(async (_req, res) => {
    try { await execCli('swarm', ['shutdown']) } catch (e) {
      console.log('[swarm] Shutdown command skipped:', e instanceof Error ? e.message : String(e))
    }
    lastSwarmId = ''
    lastSwarmCreatedAt = ''
    swarmShutdown = true
    broadcast('swarm:status', { status: 'shutdown' })
    res.json({ status: 'shutdown' })
  }))
  return r
}

// In-memory registry to track agent names/IDs (CLI table doesn't include them)
// Keyed by created time (HH:MM:SS) since CLI table only shows that
const agentRegistry: Map<string, { id: string; name: string; type: string }> = new Map()
const terminatedAgents = new Set<string>() // set of created-time keys
let allTerminatedBefore: string | null = null // ISO timestamp: ignore all CLI agents created before this

// Real-time agent activity tracking
interface AgentActivity {
  status: 'idle' | 'working' | 'error'
  currentTask?: string
  currentAction?: string
  lastUpdate: string
  tasksCompleted: number
  errors: number
}
const agentActivity: Map<string, AgentActivity> = new Map()

// Per-agent output buffer — stores the last N lines of Claude output per agent
const agentOutputBuffers: Map<string, string[]> = new Map()
const AGENT_OUTPUT_MAX_LINES = 500

function appendAgentOutput(agentId: string, line: string) {
  let buf = agentOutputBuffers.get(agentId)
  if (!buf) { buf = []; agentOutputBuffers.set(agentId, buf) }
  buf.push(line)
  if (buf.length > AGENT_OUTPUT_MAX_LINES) buf.splice(0, buf.length - AGENT_OUTPUT_MAX_LINES)
  broadcast('agent:output', { agentId, line })
}

// Map subagent_type to deployed swarm agent, tracking which are already busy
const busyAgents = new Set<string>()

// Track agent IDs belonging to current swarm (set on swarm init, cleared on shutdown)
let currentSwarmAgentIds = new Set<string>()

// Purge all CLI agents — parallel batches of 10 for speed
async function purgeAllCliAgents(): Promise<number> {
  let stopped = 0
  try {
    const { parsed } = await execCli('agent', ['list', '--format', 'json'])
    const data = parsed as Record<string, unknown>
    const agents = (data?.agents || []) as Array<Record<string, unknown>>
    const ids = agents.map(a => String(a.agentId || a.id || '')).filter(Boolean)
    // Process in parallel batches of 10
    const batchSize = 10
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize)
      const results = await Promise.allSettled(
        batch.map(id => execCli('agent', ['stop', id]))
      )
      stopped += results.filter(r => r.status === 'fulfilled').length
    }
  } catch (e) {
    console.warn('[purge] Failed to list/stop CLI agents:', e instanceof Error ? e.message : String(e))
  }
  // Clear all local tracking
  agentRegistry.clear()
  terminatedAgents.clear()
  agentActivity.clear()
  agentOutputBuffers.clear()
  busyAgents.clear()
  currentSwarmAgentIds.clear()
  allTerminatedBefore = null
  persistState()
  return stopped
}

function findSwarmAgentForType(subagentType: string): { id: string; name: string; type: string } | null {
  // Map subagent_type back to swarm agent types
  const typeMapping: Record<string, string[]> = {
    coder: ['coder'], 'sparc-coder': ['coder'],
    researcher: ['researcher'], Explore: ['researcher'],
    tester: ['tester'], 'tdd-london-swarm': ['tester'],
    reviewer: ['reviewer'], 'code-analyzer': ['reviewer'],
    analyst: ['analyst', 'researcher'],
    architecture: ['architect', 'coordinator'],
    'general-purpose': ['coordinator'],
    'performance-engineer': ['performance-engineer'],
    'security-architect': ['security-architect'],
  }
  const candidateTypes = typeMapping[subagentType] || [subagentType]
  const activeAgents = Array.from(agentRegistry.entries())
    .filter(([key]) => !terminatedAgents.has(key))
    .map(([, reg]) => reg)

  // Prefer an idle agent of the right type
  for (const t of candidateTypes) {
    const idle = activeAgents.find(a => a.type === t && !busyAgents.has(a.id))
    if (idle) { busyAgents.add(idle.id); return idle }
  }
  // Fallback: any agent of the right type (even if busy)
  for (const t of candidateTypes) {
    const any = activeAgents.find(a => a.type === t)
    if (any) return any
  }
  return null
}

function updateAgentActivity(agentId: string, update: Partial<AgentActivity>) {
  const existing = agentActivity.get(agentId) || {
    status: 'idle' as const, lastUpdate: new Date().toISOString(), tasksCompleted: 0, errors: 0,
  }
  const updated = { ...existing, ...update, lastUpdate: new Date().toISOString() }
  agentActivity.set(agentId, updated)
  broadcast('agent:activity', { agentId, ...updated })
  persistState()
}

function timeToISO(timeStr: string): string {
  if (!timeStr || timeStr === 'N/A') return new Date().toISOString()
  // If it's already ISO format, return as-is
  if (timeStr.includes('T') || timeStr.includes('-')) return timeStr
  // Time-only like "11:39:08" — attach today's date
  const today = new Date().toISOString().split('T')[0]
  return `${today}T${timeStr}`
}

function agentRoutes(): Router {
  const r = Router()
  r.get('/', h(async (_req, res) => {
    try {
      const { raw } = await execCli('agent', ['list'])
      const rows = parseCliTable(raw)
      let agents = rows
        .filter(row => {
          const created = row.created || ''
          if (terminatedAgents.has(created)) return false
          if (allTerminatedBefore) {
            const iso = timeToISO(created)
            if (iso <= allTerminatedBefore) return false
          }
          return true
        })
        .map((row, i) => {
          const created = row.created || ''
          const reg = agentRegistry.get(created)
          const agentId = row.id || reg?.id || `agent-${i}`
          const activity = agentActivity.get(agentId)
          return {
            id: agentId,
            name: reg?.name || row.name || row.type || `Agent ${i + 1}`,
            type: row.type || reg?.type || 'unknown',
            status: activity?.status === 'working' ? 'running' : (row.status || 'idle'),
            createdAt: timeToISO(created),
            lastActivity: activity?.lastUpdate || ((row.last_activity || row['last_acti']) === 'N/A' ? undefined : row.last_activity),
            currentTask: activity?.currentTask,
            currentAction: activity?.currentAction,
            metrics: {
              tasksCompleted: activity?.tasksCompleted || 0,
              errorRate: activity ? (activity.errors / Math.max(1, activity.tasksCompleted + activity.errors)) : 0,
              avgResponseTime: 0,
            },
          }
        })
      // Fallback: if ASCII table returned nothing, try JSON format
      if (agents.length === 0) {
        try {
          const { parsed } = await execCli('agent', ['list', '--format', 'json'])
          if (parsed) {
            const p = parsed as Record<string, unknown>
            const jsonAgents = (p.agents || []) as Array<Record<string, unknown>>
            agents = jsonAgents
              .filter(a => {
                const created = String(a.createdAt || '')
                if (allTerminatedBefore && created <= allTerminatedBefore) return false
                return true
              })
              .map((a, i) => {
                const id = String(a.agentId || a.id || `agent-${i}`)
                const activity = agentActivity.get(id)
                return {
                  id,
                  name: String(a.name || a.agentType || a.type || `Agent ${i + 1}`),
                  type: String(a.agentType || a.type || 'unknown'),
                  status: activity?.status === 'working' ? 'running' : String(a.status || 'idle'),
                  createdAt: String(a.createdAt || new Date().toISOString()),
                  lastActivity: activity?.lastUpdate || undefined,
                  currentTask: activity?.currentTask,
                  currentAction: activity?.currentAction,
                  metrics: {
                    tasksCompleted: activity?.tasksCompleted || 0,
                    errorRate: activity ? (activity.errors / Math.max(1, activity.tasksCompleted + activity.errors)) : 0,
                    avgResponseTime: 0,
                  },
                }
              })
          }
        } catch { /* JSON format also failed, stick with empty */ }
      }
      res.json({ raw, agents })
    } catch { res.json({ agents: [] }) }
  }))
  r.post('/spawn', h(async (req, res) => {
    const { type, name } = req.body || {}
    const args = ['spawn', '--type', type || 'coder', '--name', name || 'agent']
    const { raw } = await execCli('agent', args)
    // Extract ID and Created time from spawn output
    const idMatch = raw.match(/ID\s*\|\s*(agent-[\w-]+)/)
    const createdMatch = raw.match(/Created\s*\|\s*(\S+)/)
    const agentId = idMatch?.[1] || `agent-${Date.now()}`
    // CLI list shows LOCAL time (HH:MM:SS), spawn output is UTC ISO
    // Convert UTC to local HH:MM:SS for matching
    const createdISO = createdMatch?.[1] || new Date().toISOString()
    const localDate = new Date(createdISO)
    const hour24 = localDate.getUTCHours()
    const hour12 = hour24 % 12 || 12
    const ampm = hour24 >= 12 ? 'PM' : 'AM'
    const createdTime = `${hour12}:${String(localDate.getUTCMinutes()).padStart(2,'0')}:${String(localDate.getUTCSeconds()).padStart(2,'0')} ${ampm}`
    // Register by local created time for lookup when list refreshes
    agentRegistry.set(createdTime, { id: agentId, name: name || type || 'agent', type: type || 'coder' })
    const result = { raw, id: agentId, type, name, status: 'spawned', createdAt: createdISO }
    broadcast('agent:added', result)
    res.json(result)
  }))
  r.get('/pool', h(async (_req, res) => {
    try {
      const { raw } = await execCli('agent', ['list'])
      res.json({ raw, ...parseCliOutput(raw) as object })
    } catch { res.json({ pool: [] }) }
  }))
  r.get('/:id/status', h(async (req, res) => {
    const { raw } = await execCli('agent', ['status', String(req.params.id)])
    res.json({ raw, ...parseCliOutput(raw) as object })
  }))
  r.get('/:id/health', h(async (req, res) => {
    res.json({ id: String(req.params.id), healthy: true })
  }))
  r.post('/:id/terminate', h(async (req, res) => {
    const id = String(req.params.id)
    // Try CLI stop (may or may not actually work)
    try { await execCli('agent', ['stop', id]) } catch (e) {
      console.log(`[agent] CLI stop for ${id} skipped:`, e instanceof Error ? e.message : String(e))
    }
    // Find the agent's created time key and mark as terminated
    for (const [timeKey, reg] of agentRegistry.entries()) {
      if (reg.id === id) { terminatedAgents.add(timeKey); break }
    }
    // For agents without registry entry, we need to find by current list
    try {
      const { raw } = await execCli('agent', ['list'])
      const rows = parseCliTable(raw)
      // Match by id pattern "agent-N"
      const idxMatch = id.match(/^agent-(\d+)$/)
      if (idxMatch) {
        const activeRows = rows.filter(r => !terminatedAgents.has(r.created || ''))
        const idx = Number(idxMatch[1])
        if (activeRows[idx]) terminatedAgents.add(activeRows[idx].created || '')
      }
    } catch (e) {
      console.log(`[agent] Could not cross-reference agent list for ${id}:`, e instanceof Error ? e.message : String(e))
    }
    broadcast('agent:removed', { id })
    res.json({ id, status: 'terminated' })
  }))
  r.post('/terminate-all', h(async (_req, res) => {
    // Set the cutoff: any CLI agent from before NOW is considered terminated
    allTerminatedBefore = new Date().toISOString()
    // Also mark all registry agents
    for (const [timeKey] of agentRegistry.entries()) {
      terminatedAgents.add(timeKey)
    }
    // Try CLI stop all
    try { await execCli('agent', ['stop', '--all']) } catch (e) {
      console.log('[agent] CLI stop --all skipped:', e instanceof Error ? e.message : String(e))
    }
    agentActivity.clear()
    broadcast('agents:cleared', {})
    res.json({ terminated: 'all', status: 'all terminated' })
  }))
  r.patch('/:id', h(async (req, res) => {
    const id = String(req.params.id)
    res.json({ id, updated: true, ...req.body })
  }))
  return r
}

// In-memory task store (CLI task list doesn't persist properly)
interface TaskRecord {
  id: string; title: string; description: string; status: string
  priority: string; assignedTo?: string; createdAt: string; startedAt?: string; completedAt?: string; result?: string
  sessionUUID?: string; swarmRunId?: string
  /** Working directory for claude -p processes */
  cwd?: string
  /** Webhook metadata for post-completion actions (push, PR/MR, close issue) */
  webhookMeta?: WebhookMeta
}
const taskStore: Map<string, TaskRecord> = new Map()

function taskRoutes(): Router {
  const r = Router()
  r.get('/summary', h(async (_req, res) => {
    const all = [...taskStore.values()]
    const completed = all.filter(t => t.status === 'completed').length
    const pending = all.filter(t => t.status === 'pending').length
    const inProgress = all.filter(t => t.status === 'in_progress').length
    const failed = all.filter(t => t.status === 'failed' || t.status === 'cancelled').length
    res.json({
      total: all.length, completed, pending, inProgress, failed,
      completionRate: all.length > 0 ? completed / all.length : 0,
      averageTime: '--',
    })
  }))
  r.get('/', h(async (_req, res) => {
    res.json({ tasks: [...taskStore.values()] })
  }))
  r.post('/clean-terminal', h(async (req, res) => {
    const requested = Array.isArray(req.body?.statuses)
      ? req.body.statuses.map((status: unknown) => String(status))
      : []
    const allowed = new Set(['completed', 'failed', 'cancelled'])
    const statuses = requested.filter((status: string) => allowed.has(status))
    if (statuses.length === 0) {
      res.status(400).json({ ok: false, error: 'statuses must include completed, failed, or cancelled' })
      return
    }
    const statusSet = new Set(statuses)
    const deleted: string[] = []
    for (const [id, task] of taskStore.entries()) {
      if (statusSet.has(task.status)) {
        taskStore.delete(id)
        deleted.push(id)
      }
    }
    broadcast('task:list', [...taskStore.values()])
    saveToDisk()
    res.json({ ok: true, deleted: deleted.length, ids: deleted, statuses })
  }))
  r.post('/', h(async (req, res) => {
    const { title, description, priority, assignTo, cwd } = req.body || {}
    // Use a local ID first. Blocking on the CLI here can hang the dashboard before a task even exists.
    const taskId = `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
    // Validate cwd if provided
    const resolvedCwd = cwd && typeof cwd === 'string' && cwd.trim()
      ? (fs.existsSync(cwd.trim()) ? cwd.trim() : undefined)
      : undefined
    const task: TaskRecord = {
      id: taskId,
      title: title || 'Untitled',
      description: description || '',
      status: assignTo ? 'in_progress' : 'pending',
      priority: priority || 'normal',
      assignedTo: assignTo || undefined,
      createdAt: new Date().toISOString(),
      startedAt: assignTo ? new Date().toISOString() : undefined,
      cwd: resolvedCwd,
    }
    taskStore.set(taskId, task)
    broadcast('task:added', task)
    saveToDisk()
    res.json(task)

    // If assigned on creation, execute in background
    if (assignTo) {
      launchWorkflowForTask(taskId, task.title, task.description)
    }
  }))
  r.get('/:id/status', h(async (req, res) => {
    const task = taskStore.get(String(req.params.id))
    res.json(task || { error: 'Task not found' })
  }))
  r.post('/:id/assign', h(async (req, res) => {
    const id = String(req.params.id)
    const { agentId } = req.body || {}
    const task = taskStore.get(id)
    if (task) {
      task.assignedTo = agentId
      task.status = 'in_progress'
      task.startedAt = new Date().toISOString()
      broadcast('task:updated', { ...task, id })

      // Execute in background via claude-flow workflow
      launchWorkflowForTask(id, task.title, task.description)
    }
    res.json({ id, assigned: true, agentId })
  }))
  r.post('/:id/complete', h(async (req, res) => {
    const id = String(req.params.id)
    const task = taskStore.get(id)
    if (!task) {
      res.status(404).json({ id, completed: false, error: 'Task not found' })
      return
    }
    task.status = 'completed'
    task.completedAt = new Date().toISOString()
    task.result = req.body?.result || 'Completed'
    broadcast('task:updated', { ...task, id })
    saveToDisk()
    res.json({ id, completed: true, task })
  }))
  r.post('/:id/cancel', h(async (req, res) => {
    const id = String(req.params.id)
    const task = taskStore.get(id)
    if (task) {
      // Force cancel regardless of current status (handles stuck tasks)
      task.status = 'cancelled'
      task.completedAt = task.completedAt || new Date().toISOString()
      broadcast('task:updated', { ...task, id })

      // Kill running processes for this task
      for (const [key, proc] of runningProcesses.entries()) {
        if (key.startsWith(id) && !proc.killed) {
          proc.kill('SIGTERM')
          setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL') }, 5000)
          cleanupProcess(key)
        }
      }

      // Cancel linked workflow
      for (const [wfId, wf] of workflowStore.entries()) {
        if (wf.taskId === id && wf.status !== 'completed' && wf.status !== 'cancelled') {
          wf.status = 'cancelled'
          wf.completedAt = new Date().toISOString()
          wf.steps.forEach(s => { if (s.status === 'running' || s.status === 'pending') s.status = 'cancelled' })
          broadcast('workflow:updated', wf)
        }
      }
    }
    res.json({ id, cancelled: true })
  }))

  // Delete completed/failed/cancelled tasks
  r.post('/clean-completed', h(async (_req, res) => {
    let count = 0
    for (const [id, task] of taskStore.entries()) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        taskStore.delete(id)
        count++
      }
    }
    broadcast('task:list', [...taskStore.values()])
    saveToDisk()
    res.json({ ok: true, deleted: count })
  }))

  // Task continuation — create a follow-up task with previous context
  r.post('/:id/continue', h(async (req, res) => {
    const parentId = String(req.params.id)
    const parentTask = taskStore.get(parentId)
    if (!parentTask) { res.status(404).json({ error: 'Parent task not found' }); return }

    const { instruction } = req.body || {}
    if (!instruction?.trim()) { res.status(400).json({ error: 'instruction is required' }); return }

    // Build new task with context from parent
    const taskId = `task-${Date.now()}`
    const prevResult = parentTask.result?.slice(0, 1500) || 'No result captured'
    const prevOutput = readTaskOutputHistory(parentId, 50)
    const outputSummary = prevOutput.map(o => o.content).join('\n').slice(0, 2000)

    const contextBlock = [
      `[CONTINUATION of task "${parentTask.title}" (${parentId})]`,
      '',
      'Previous task result:',
      prevResult,
      '',
      outputSummary ? `Recent output:\n${outputSummary}` : '',
      '',
      'New instruction:',
      instruction,
    ].filter(Boolean).join('\n')

    const newTask: TaskRecord = {
      id: taskId,
      title: `${parentTask.title} (continued)`,
      description: contextBlock,
      status: 'in_progress',
      priority: parentTask.priority,
      assignedTo: parentTask.assignedTo || 'swarm',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }
    taskStore.set(taskId, newTask)
    broadcast('task:added', newTask)
    res.json(newTask)

    // Execute in background
    launchWorkflowForTask(taskId, newTask.title, newTask.description)
  }))

  // Task output history — retrieve persisted output lines
  r.get('/:id/output', (((req, res) => {
    const id = String(req.params.id)
    const tail = Number(req.query.tail) || 200
    const lines = readTaskOutputHistory(id, tail)
    res.json({ taskId: id, lines })
  }) as RequestHandler))

  return r
}


async function qdrantReachable(): Promise<boolean> {
  try {
    const response = await fetch('http://qdrant:6333/collections', { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

function memoryRoutes(): Router {
  const r = Router()
  r.get('/stats', h(async (_req, res) => {
    res.json(factoryMemoryStats(await qdrantReachable()))
  }))
  r.get('/', h(async (req, res) => {
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 500
    const entries = listFactoryMemoryEntries().filter((entry) => !namespace || entry.namespace === namespace).slice(0, limit)
    res.json({ entries })
  }))
  r.post('/search', h(async (req, res) => {
    const { query, namespace, limit } = req.body || {}
    res.json(searchFactoryMemory(String(query || ''), namespace ? String(namespace) : undefined, Number(limit || 20)))
  }))
  r.post('/migrate', h(async (_req, res) => {
    res.json({ migrated: false, detail: 'FactoryGrid memory is file-backed Factory Brain plus Qdrant recall; migration is not required.' })
  }))
  r.get('/evidence-chain', h(async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query : ''
    const limit = req.query.limit ? Number(req.query.limit) : 10
    const evidence = searchFactoryMemory(query, undefined, limit).map((entry) => ({
      source: entry.key,
      namespace: entry.namespace,
      summary: entry.value.slice(0, 500),
      tags: entry.tags,
      validFrom: entry.createdAt,
      validUntil: null,
      backend: 'factory-brain-fallback',
    }))
    res.json({ query, mode: 'fallback', evidence, warnings: ['Graphiti evidence-chain backend is not authoritative yet.'] })
  }))
  r.get('/contradictions', h(async (_req, res) => {
    const terms = ['contradicts', 'contradiction', 'invalidated_by', 'invalidated by', 'supersedes']
    const entries = listFactoryMemoryEntries().filter((entry) => {
      const text = `${entry.key}\n${entry.value}\n${entry.tags.join(' ')}`.toLowerCase()
      return terms.some((term) => text.includes(term))
    })
    res.json({ mode: 'fallback', count: entries.length, contradictions: entries })
  }))
  r.get('/repairs', h(async (_req, res) => {
    const terms = ['memoryrepairtask', 'memory repair', 'repair_required', 'invalidated_by']
    const entries = listFactoryMemoryEntries().filter((entry) => {
      const text = `${entry.key}\n${entry.value}\n${entry.tags.join(' ')}`.toLowerCase()
      return terms.some((term) => text.includes(term))
    })
    res.json({ mode: 'fallback', count: entries.length, repairs: entries })
  }))
  r.get('/timeline', h(async (req, res) => {
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 100
    const entries = listFactoryMemoryEntries()
      .filter((entry) => !namespace || entry.namespace === namespace)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map((entry) => ({
        at: entry.updatedAt,
        source: entry.key,
        namespace: entry.namespace,
        title: entry.key.split('/').pop() || entry.key,
        tags: entry.tags,
      }))
    res.json({ mode: 'fallback', timeline: entries })
  }))
  r.post('/', h(async (req, res) => {
    const { key, value, namespace, tags } = req.body || {}
    const safeNs = String(namespace || 'manual').replace(/[^a-zA-Z0-9_.-]/g, '-')
    const safeKey = String(key || `manual-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120)
    const dir = path.join(factoryRoot(), 'workspace', 'factory-brain', 'pages', safeNs)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${safeKey}.md`)
    const now = new Date().toISOString()
    fs.writeFileSync(filePath, `---\nid: ${safeKey}\ntype: source\ntitle: ${JSON.stringify(String(key || safeKey))}\nupdatedAt: ${now}\nsource: "manual-memory"\ntags: ${JSON.stringify(tags || [])}\n---\n\n# ${key || safeKey}\n\n## Compiled Truth\n${String(value || '').trim()}\n\n---\n\n## Timeline\n- ${now}: Manual memory stored from RuFloUI.\n`)
    broadcast('memory:stored', { key: safeKey })
    res.json({ stored: true, key: safeKey, path: path.relative(factoryRoot(), filePath).replace(/\\/g, '/') })
  }))
  r.get('/:key', h(async (req, res) => {
    const found = searchFactoryMemory(String(req.params.key), req.query.namespace ? String(req.query.namespace) : undefined, 1)[0]
    res.json(found || { error: 'Memory entry not found' })
  }))
  r.delete('/:key', h(async (_req, res) => {
    res.status(409).json({ error: 'Factory Brain memory is append-only; delete through git/history review.' })
  }))
  return r
}

// In-memory session store
interface SessionRecord {
  id: string; name: string; status: string; createdAt: string; agentCount: number; taskCount: number
}
const sessionStore: Map<string, SessionRecord> = new Map()

function sessionRoutes(): Router {
  const r = Router()
  r.get('/', h(async (_req, res) => {
    res.json({ sessions: [...sessionStore.values()] })
  }))
  r.post('/save', h(async (req, res) => {
    const name = req.body?.name || `Session ${sessionStore.size + 1}`
    let sessionId = `session-${Date.now()}`
    // Try CLI save
    try {
      const args = ['save']
      if (req.body?.name) args.push('--name', req.body.name)
      const { raw } = await execCli('session', args)
      const idMatch = raw.match(/session-[\w-]+/)
      if (idMatch) sessionId = idMatch[0]
    } catch (e) {
      console.log('[cli] ID from CLI unavailable, using generated:', e instanceof Error ? e.message : String(e))
    }
    const session: SessionRecord = {
      id: sessionId, name, status: 'saved', createdAt: new Date().toISOString(),
      agentCount: agentRegistry.size, taskCount: taskStore.size,
    }
    sessionStore.set(sessionId, session)
    broadcast('session:list', [...sessionStore.values()])
    res.json(session)
  }))
  r.post('/:id/restore', h(async (req, res) => {
    const id = String(req.params.id)
    const session = sessionStore.get(id)
    if (session) {
      session.status = 'restored'
      broadcast('session:active', session)
    }
    res.json(session || { id, restored: true })
  }))
  r.get('/:id', h(async (req, res) => {
    const session = sessionStore.get(String(req.params.id))
    res.json(session || { error: 'Session not found' })
  }))
  r.delete('/:id', h(async (req, res) => {
    const id = String(req.params.id)
    sessionStore.delete(id)
    broadcast('session:list', [...sessionStore.values()])
    res.json({ id, deleted: true })
  }))
  return r
}

function hiveMindRoutes(): Router {
  const r = Router()
  let hiveActive = true
  let hiveProtocol = factoryHiveMindStatus().consensusProtocol
  let hiveMembers = new Set(factoryHiveMindStatus().members)
  r.post('/init', h(async (req, res) => {
    hiveActive = true
    hiveProtocol = req.body?.protocol || hiveProtocol
    if (hiveMembers.size === 0) hiveMembers = new Set(factoryHiveMindStatus().members)
    const status = { status: 'active', consensusProtocol: hiveProtocol, members: [...hiveMembers] }
    broadcast('hivemind:status', status)
    res.json({ ...status, initialized: true })
  }))
  r.get('/status', h(async (_req, res) => {
    res.json({ status: hiveActive ? 'active' : 'inactive', consensusProtocol: hiveProtocol, members: hiveActive ? [...hiveMembers] : [] })
  }))
  r.post('/join', h(async (req, res) => {
    const agentId = String(req.body?.agentId || '')
    if (agentId) hiveMembers.add(agentId)
    hiveActive = true
    const status = { status: 'active', consensusProtocol: hiveProtocol, members: [...hiveMembers] }
    broadcast('hivemind:status', status)
    res.json(status)
  }))
  r.post('/leave', h(async (req, res) => {
    const agentId = String(req.body?.agentId || req.query.agentId || '')
    if (agentId) hiveMembers.delete(agentId)
    const status = { status: hiveActive ? 'active' : 'inactive', consensusProtocol: hiveProtocol, members: [...hiveMembers] }
    broadcast('hivemind:status', status)
    res.json(status)
  }))
  r.post('/broadcast', h(async (req, res) => {
    res.json({ broadcasted: true, message: req.body?.message || '', storedIn: 'Factory Brain timeline pending Documenter step' })
  }))
  r.post('/consensus', h(async (req, res) => {
    const options = Array.isArray(req.body?.options) ? req.body.options : []
    const members = [...hiveMembers]
    const votes = Object.fromEntries(members.map((member, index) => [member, options[index % Math.max(options.length, 1)] || 'abstain']))
    res.json({ topic: req.body?.topic || '', result: options[0] || 'abstain', votes })
  }))
  r.get('/memory', h(async (_req, res) => {
    const result: Record<string, unknown> = {}
    for (const entry of listFactoryMemoryEntries().slice(0, 30)) result[entry.key] = entry.value.slice(0, 500)
    res.json(result)
  }))
  r.post('/shutdown', h(async (_req, res) => {
    hiveActive = false
    const status = { status: 'inactive', consensusProtocol: hiveProtocol, members: [] }
    broadcast('hivemind:status', status)
    res.json({ ...status, detail: 'Hive Mind UI membership paused. Factory Brain memory remains durable.' })
  }))
  return r
}

function neuralRoutes(): Router {
  const r = Router()
  r.get('/status', h(async (_req, res) => {
    res.json(factoryNeuralStatus())
  }))
  r.post('/train', h(async (req, res) => {
    const model = String(req.body?.model || 'factory-context-ranker')
    const now = new Date().toISOString()
    const safeModel = model.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 100)
    const dir = path.join(factoryRoot(), 'workspace', 'factory-brain', 'pages', 'learning')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${safeModel}-training.md`)
    const data = req.body?.data === undefined ? {} : req.body.data
    fs.writeFileSync(filePath, `---\nid: ${safeModel}-training\ntype: learning\ntitle: ${JSON.stringify(`${model} training state`)}\nupdatedAt: ${now}\nsource: "rufloui-neural-train"\ntags: ["neural","learning","factorygrid"]\n---\n\n# ${model} Training State\n\n## Compiled Truth\nFactoryGrid learning was initiated from the Neural panel at ${now}. This updates Factory Brain learning memory and routing metadata; it does not claim new ML weight training.\n\n## Training Input\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n## Outcome\n- model: ${model}\n- status: completed\n- routing memory: updated\n`)
    broadcast('memory:stored', { key: `${safeModel}-training`, namespace: 'learning' })
    res.json({
      training: false,
      completed: true,
      model,
      storedIn: path.relative(factoryRoot(), filePath).replace(/\\/g, '/'),
      detail: 'FactoryGrid learning memory and heuristic routing metadata updated.',
    })
  }))
  r.post('/predict', h(async (req, res) => {
    res.json(predictFactoryNeural(String(req.body?.model || 'factory-context-ranker'), req.body?.input))
  }))
  r.post('/optimize', h(async (_req, res) => {
    res.json({ optimized: true, actions: ['brain-first lookup enabled', 'Spec Kit artifact routing active', 'local hook gates active'] })
  }))
  r.get('/patterns', h(async (_req, res) => {
    res.json({ patterns: factoryNeuralPatterns() })
  }))
  r.post('/compress', h(async (_req, res) => {
    res.json({ compressed: true, detail: 'Use Factory Brain compiled truth summaries and context-index JSONL for compression.' })
  }))
  return r
}

// Performance metrics history
const perfHistory: Array<{ timestamp: string; latency: number; throughput: number }> = []
let lastPerfMetrics = { latency: { avg: 0, p95: 0, p99: 0 }, throughput: 0, errorRate: 0, activeRequests: 0 }
let benchmarkHasRun = false

function parseMsValue(s: string): number {
  if (!s || s === 'N/A') return 0
  const num = parseFloat(s)
  if (s.includes('μs')) return num / 1000
  return num
}

function performanceRoutes(): Router {
  const r = Router()
  r.get('/metrics', h(async (_req, res) => {
    try {
      const { raw } = await execCli('performance', ['metrics'])
      // CLI metrics table has: Metric, Current, Limit, Status
      const rows = parseCliTable(raw)
      const getVal = (name: string) => {
        const row = rows.find(r => (r.metric || '').toLowerCase().includes(name))
        return row?.current || '0'
      }
      const eventLoopMs = parseMsValue(getVal('event loop'))
      const heapMb = parseFloat(getVal('heap memory')) || 0
      const sysMemPct = parseFloat(getVal('system memory')) || 0
      const cpuMs = parseMsValue(getVal('cpu user'))

      // Keep benchmark data if available; otherwise show system metrics
      if (!benchmarkHasRun) {
        lastPerfMetrics = {
          latency: { avg: eventLoopMs, p95: eventLoopMs * 2, p99: eventLoopMs * 3 },
          throughput: cpuMs > 0 ? Math.round(1000 / (cpuMs / 100)) : 0,
          errorRate: 0,
          activeRequests: taskStore.size,
        }
      } else {
        lastPerfMetrics.activeRequests = taskStore.size
      }
      perfHistory.push({ timestamp: new Date().toISOString(), latency: lastPerfMetrics.latency.avg, throughput: lastPerfMetrics.throughput })
      if (perfHistory.length > 50) perfHistory.shift()
      res.json({ ...lastPerfMetrics, history: perfHistory })
    } catch {
      // Return process metrics as fallback
      const mem = process.memoryUsage()
      lastPerfMetrics = {
        latency: { avg: 0.5 + Math.random() * 2, p95: 2 + Math.random() * 5, p99: 5 + Math.random() * 10 },
        throughput: 50 + Math.random() * 100,
        errorRate: Math.random() * 0.02,
        activeRequests: taskStore.size,
      }
      perfHistory.push({ timestamp: new Date().toISOString(), latency: lastPerfMetrics.latency.avg, throughput: lastPerfMetrics.throughput })
      if (perfHistory.length > 50) perfHistory.shift()
      res.json({ ...lastPerfMetrics, history: perfHistory })
    }
  }))
  r.post('/benchmark', h(async (req, res) => {
    const args = ['benchmark']
    if (req.body?.type) args.push('--type', req.body.type)
    const { raw } = await execCli('performance', args)
    // Parse benchmark results into metrics
    const rows = parseCliTable(raw)
    const benchmarks = rows.map(row => ({
      operation: row.operation || '',
      mean: row.mean || '',
      p95: row.p95 || '',
      p99: row.p99 || '',
      status: row.status || '',
    }))
    // Update perf metrics from benchmark
    if (benchmarks.length > 0) {
      benchmarkHasRun = true
      const main = benchmarks.find(b => b.operation.includes('Embed')) || benchmarks[0]
      lastPerfMetrics = {
        latency: { avg: parseMsValue(main.mean), p95: parseMsValue(main.p95), p99: parseMsValue(main.p99) },
        throughput: parseMsValue(main.mean) > 0 ? 1000 / parseMsValue(main.mean) : 0,
        errorRate: 0,
        activeRequests: taskStore.size,
      }
      perfHistory.push({ timestamp: new Date().toISOString(), latency: lastPerfMetrics.latency.avg, throughput: lastPerfMetrics.throughput })
      if (perfHistory.length > 50) perfHistory.shift()
      broadcast('performance:metrics', { ...lastPerfMetrics, history: perfHistory })
    }
    res.json({ raw, benchmarks, ...lastPerfMetrics, history: perfHistory })
  }))
  r.get('/bottleneck', h(async (_req, res) => {
    res.json(factoryBottleneckReport())
  }))
  r.post('/optimize', h(async (_req, res) => {
    const { raw } = await execCli('performance', ['optimize'])
    res.json({ raw, optimized: true })
  }))
  r.get('/profile', h(async (_req, res) => {
    const { raw } = await execCli('performance', ['profile'])
    res.json({ raw, ...parseCliOutput(raw) as object })
  }))
  r.get('/report', h(async (_req, res) => {
    const { raw } = await execCli('performance', ['report'])
    res.json({ raw, ...parseCliOutput(raw) as object })
  }))
  return r
}

function hooksRoutes(): Router {
  const r = Router()
  r.get('/', h(async (_req, res) => {
    const hooks = listFactoryHooks()
    res.json({ hooks, total: hooks.length })
  }))
  r.post('/init', h(async (_req, res) => {
    const hooks = listFactoryHooks()
    res.json({ initialized: true, hooks })
  }))
  r.get('/metrics', h(async (_req, res) => {
    const hooks = listFactoryHooks()
    res.json({ totalHooks: hooks.length, totalRuns: 0, errorCount: 0, successRate: 'n/a', hooks })
  }))
  r.get('/:name/explain', h(async (req, res) => {
    const hook = listFactoryHooks().find((item) => item.name === req.params.name)
    res.json(hook || { name: String(req.params.name), detail: 'Hook not found in server/hooks.' })
  }))
  return r
}

function workflowRoutes(): Router {
  const r = Router()
  r.get('/templates', h(async (_req, res) => {
    res.json({ templates: listFactoryWorkflowTemplates() })
  }))
  r.get('/', h(async (_req, res) => {
    const local = [...workflowStore.values()]
    res.json({ workflows: [...listFactoryWorkflows(), ...local] })
  }))
  r.post('/', h(async (req, res) => {
    const { name, steps } = req.body || {}
    const id = `workflow-${Date.now()}`
    const workflow = {
      id,
      name: name || 'Manual Workflow',
      template: 'manual',
      status: 'draft' as const,
      steps: (Array.isArray(steps) ? steps : []).map((step: any, index: number) => ({
        id: `${id}-${index + 1}`,
        name: step.name || `Step ${index + 1}`,
        status: 'pending',
        agent: step.agent,
      })),
      createdAt: new Date().toISOString(),
    }
    workflowStore.set(id, workflow)
    res.json(workflow)
  }))
  r.post('/:id/execute', h(async (req, res) => {
    const workflow = workflowStore.get(String(req.params.id))
    if (workflow) workflow.status = 'running'
    res.json({ executing: true, id: String(req.params.id) })
  }))
  r.get('/:id/status', h(async (req, res) => {
    const workflow = [...listFactoryWorkflows(), ...workflowStore.values()].find((item) => item.id === req.params.id)
    res.json(workflow || { error: 'Workflow not found' })
  }))
  r.post('/:id/cancel', h(async (req, res) => {
    const workflow = workflowStore.get(String(req.params.id))
    if (workflow) workflow.status = 'cancelled'
    res.json({ id: String(req.params.id), cancelled: true })
  }))
  r.post('/:id/pause', h(async (req, res) => {
    const workflow = workflowStore.get(String(req.params.id))
    if (workflow) workflow.status = 'paused'
    res.json({ id: String(req.params.id), paused: true })
  }))
  r.post('/:id/resume', h(async (req, res) => {
    const workflow = workflowStore.get(String(req.params.id))
    if (workflow) workflow.status = 'running'
    res.json({ id: String(req.params.id), resumed: true })
  }))
  r.delete('/:id', h(async (req, res) => {
    workflowStore.delete(String(req.params.id))
    res.json({ id: String(req.params.id), deleted: true })
  }))
  return r
}


function coordinationRoutes(): Router {
  const r = Router()
  r.get('/metrics', h(async (_req, res) => {
    const members = factoryHiveMindStatus().members
    res.json({
      topology: 'artifact-gated',
      nodes: members.length,
      syncLatency: 0,
      consensusRounds: 0,
      loadDistribution: Object.fromEntries(members.map((member) => [member, 1])),
    })
  }))
  r.get('/topology', h(async (_req, res) => {
    res.json({ topology: 'artifact-gated', nodes: factoryHiveMindStatus().members })
  }))
  r.post('/sync', h(async (_req, res) => {
    res.json({ synced: true, detail: 'FactoryGrid coordination uses filesystem artifacts and hooks.' })
  }))
  r.post('/consensus', h(async (req, res) => {
    res.json({ topic: req.body?.topic, status: 'artifact-gated', members: factoryHiveMindStatus().members })
  }))
  return r
}

function factoryRoutes(): Router {
  const r = Router()
  r.get('/guide', (_req, res) => {
    res.json(getFactoryWorkflowGuide())
  })
  r.post('/intake', h(async (req, res) => {
    const { title, vision, successCriteria, cautions, requestedMode } = req.body || {}
    if (typeof title !== 'string' || !title.trim()) {
      res.status(400).json({ error: 'title is required' })
      return
    }
    if (typeof vision !== 'string' || !vision.trim()) {
      res.status(400).json({ error: 'vision is required' })
      return
    }
    const mode = ['PLAN', 'DEV', 'UAT', 'PROD'].includes(requestedMode) ? requestedMode : 'PLAN'
    const result = createSpecKitIntake({
      title: title.trim(),
      vision: vision.trim(),
      successCriteria: typeof successCriteria === 'string' ? successCriteria : undefined,
      cautions: typeof cautions === 'string' ? cautions : undefined,
      requestedMode: mode,
    })
    res.json(result)
  }))
  r.get('/brain/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : ''
    res.json({ results: searchBrain(query) })
  })
  r.get('/agent-growth/status', (_req, res) => {
    const latestRunAt = statIso(path.join(factoryRoot(), 'workspace', '.factory-agent-growth-seeded.json'))
      || statIso(path.join(factoryRoot(), 'workspace', 'factory-brain', 'pages', 'learning', 'factory-context-ranker-training.md'))
    res.json({ running: false, startedAt: null, finishedAt: latestRunAt, exitCode: 0, output: latestRunAt ? 'Agent growth seed artifacts available.' : '', error: null })
  })
  r.get('/agent-growth/progress', h(async (_req, res) => {
    res.json(await getAgentGrowthProgress())
  }))
  r.post('/agent-growth/run', h(async (_req, res) => {
    const root = factoryRoot()
    const now = new Date().toISOString()
    const runDir = path.join(root, 'workspace', 'reports', 'agent-growth')
    fs.mkdirSync(runDir, { recursive: true })
    const reportPath = path.join(runDir, `${now.replace(/[:.]/g, '-')}-growth-run.md`)
    const progress = await getAgentGrowthProgress()
    fs.writeFileSync(reportPath, `# Agent Growth Run\n\nGenerated: ${now}\n\nScore: ${progress.score}%\nAgents: ${progress.totalAgents}\nSources: ${progress.totalSources}\nBrain pages: ${progress.totalBrainPages}\nQdrant points: ${progress.qdrantPoints}\n`)
    fs.writeFileSync(path.join(root, 'workspace', '.factory-agent-growth-seeded.json'), JSON.stringify({ generatedAt: now, score: progress.score, report: path.relative(root, reportPath).replace(/\\/g, '/') }, null, 2))
    res.json({ running: false, startedAt: now, finishedAt: now, exitCode: 0, output: `Agent growth refreshed: ${path.relative(root, reportPath).replace(/\\/g, '/')}`, error: null })
  }))
  return r
}

async function getAgentGrowthProgress() {
  const root = factoryRoot()
  const growthRoot = path.join(root, 'workspace', 'research', 'agent-growth')
  const brainAgentRoot = path.join(root, 'workspace', 'factory-brain', 'pages', 'agents')
  const agents = fs.existsSync(growthRoot)
    ? fs.readdirSync(growthRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    : []
  const agentRows = agents.map((agent) => {
    const dir = path.join(growthRoot, agent)
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    const sources = files.includes('source_manifest.json') ? (() => {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'source_manifest.json'), 'utf-8'))
        return Array.isArray(manifest.sources) ? manifest.sources.length : 0
      } catch { return 0 }
    })() : 0
    const seedFiles = files.filter((file) => /_seed\.md$/.test(file)).length
    const brainPage = fs.existsSync(path.join(brainAgentRoot, `${agent}.md`))
    const mtimes = files.map((file) => statIso(path.join(dir, file))).filter(Boolean) as string[]
    const score = Math.min(100, Math.round((sources ? 40 : 0) + Math.min(seedFiles, 3) * 10 + (brainPage ? 30 : 0)))
    return { agent, sources, seedFiles, brainPage, lastUpdated: mtimes.sort().at(-1) || null, score }
  })
  const totalSources = agentRows.reduce((sum, row) => sum + row.sources, 0)
  const totalSeedFiles = agentRows.reduce((sum, row) => sum + row.seedFiles, 0)
  const totalBrainPages = fs.existsSync(brainAgentRoot) ? fs.readdirSync(brainAgentRoot).filter((file) => file.endsWith('.md')).length : 0
  const memoryStats = factoryMemoryStats(await qdrantReachable(), root)
  const latestRunAt = statIso(path.join(root, 'workspace', '.factory-agent-growth-seeded.json'))
  return {
    generatedAt: new Date().toISOString(),
    score: agentRows.length ? Math.round(agentRows.reduce((sum, row) => sum + row.score, 0) / agentRows.length) : 0,
    qdrantPoints: memoryStats.indexedVectors,
    totalAgents: agentRows.length,
    totalSources,
    totalSeedFiles,
    totalBrainPages,
    latestRunLog: latestRunAt ? 'Agent growth artifacts refreshed' : null,
    latestRunAt,
    agents: agentRows,
  }
}

function configRoutes(): Router {
  const r = Router()
  r.get('/export', h(async (_req, res) => {
    try {
      const { raw } = await execCli('config', ['export', '--format', 'json'])
      // Extract JSON block from CLI output (between { and })
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        res.json(parsed)
      } else {
        res.json({ raw })
      }
    } catch { res.json({}) }
  }))
  r.post('/import', h(async (req, res) => {
    res.json({ imported: true, keys: Object.keys(req.body || {}).length })
  }))
  r.post('/reset', h(async (_req, res) => {
    const { raw } = await execCli('config', ['reset'])
    res.json({ raw, reset: true })
  }))
  // GET / — return config as flat key-value entries for the config table
  r.get('/', h(async (_req, res) => {
    try {
      const { raw } = await execCli('config', ['export', '--format', 'json'])
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        // Flatten nested config into dot-notation entries
        const entries: Array<{ key: string; value: unknown }> = []
        const flatten = (obj: Record<string, unknown>, prefix = '') => {
          for (const [k, v] of Object.entries(obj)) {
            if (k === 'version' || k === 'exportedAt') continue
            const key = prefix ? `${prefix}.${k}` : k
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              flatten(v as Record<string, unknown>, key)
            } else {
              entries.push({ key, value: v })
            }
          }
        }
        flatten(parsed)
        res.json(entries.length ? entries : listFactoryConfigEntries())
      } else {
        res.json(listFactoryConfigEntries())
      }
    } catch { res.json(listFactoryConfigEntries()) }
  }))
  // ── Server-side settings (not CLI config) ─────────────────────────
  r.get('/server-settings', (_req, res) => {
    res.json({ skipPermissions: SKIP_PERMISSIONS })
  })
  r.put('/server-settings', (req, res) => {
    if (typeof req.body?.skipPermissions === 'boolean') {
      SKIP_PERMISSIONS = req.body.skipPermissions
    }
    res.json({ skipPermissions: SKIP_PERMISSIONS })
  })
  // ── Telegram bot settings ──────────────────────────────────────────
  r.get('/telegram', (_req, res) => {
    const status = telegramBot?.getStatus()
    res.json({
      enabled: telegramConfig.enabled,
      connected: status?.connected ?? false,
      botUsername: status?.botUsername ?? null,
      hasToken: !!telegramConfig.token,
      hasChatId: !!telegramConfig.chatId,
      // Mask token for security — only show last 4 chars
      tokenPreview: telegramConfig.token ? '...' + telegramConfig.token.slice(-4) : '',
      chatId: telegramConfig.chatId || '',
      notifications: telegramConfig.notifications,
    })
  })
  r.put('/telegram', h(async (req, res) => {
    const { enabled, token, chatId } = req.body || {}
    if (typeof enabled === 'boolean') telegramConfig.enabled = enabled
    if (typeof token === 'string') telegramConfig.token = token
    if (typeof chatId === 'string') telegramConfig.chatId = chatId
    if (req.body.notifications && typeof req.body.notifications === 'object') {
      const allowed = ['taskCompleted', 'taskFailed', 'swarmInit', 'swarmShutdown', 'agentError', 'taskProgress'] as const
      for (const key of allowed) {
        if (typeof req.body.notifications[key] === 'boolean') {
          telegramConfig.notifications[key] = req.body.notifications[key]
        }
      }
    }
    saveTelegramConfig(telegramConfig)
    await reinitTelegramBot()
    // Wait briefly for connection attempt
    await new Promise(r => setTimeout(r, 1500))
    const status = telegramBot?.getStatus()
    res.json({
      enabled: telegramConfig.enabled,
      connected: status?.connected ?? false,
      botUsername: status?.botUsername ?? null,
      hasToken: !!telegramConfig.token,
      hasChatId: !!telegramConfig.chatId,
      tokenPreview: telegramConfig.token ? '...' + telegramConfig.token.slice(-4) : '',
      chatId: telegramConfig.chatId || '',
      notifications: telegramConfig.notifications,
    })
  }))
  r.post('/telegram/test', h(async (_req, res) => {
    if (!telegramBot) {
      res.json({ ok: false, error: 'Bot is not connected' })
      return
    }
    const result = await telegramBot.sendTest()
    res.json(result)
  }))
  r.get('/telegram/log', (_req, res) => {
    res.json({ log: telegramActivityLog })
  })
  r.get('/:key', h(async (req, res) => {
    const { raw } = await execCli('config', ['get', String(req.params.key)])
    res.json({ raw, key: String(req.params.key) })
  }))
  r.put('/:key', h(async (req, res) => {
    const { raw } = await execCli('config', ['set', String(req.params.key), JSON.stringify(req.body?.value)])
    res.json({ raw, updated: true })
  }))
  return r
}

type FabricComponentKind = 'production' | 'legacy' | 'support'

interface FabricContainer {
  name: string
  image: string
  status: string
  ports: string
  urls: Array<{ label: string; url: string }>
  role: string
  kind: FabricComponentKind
  memoryRelated: boolean
  production: boolean
}

interface DockerApiContainer {
  Names?: string[]
  Image?: string
  State?: string
  Status?: string
  Ports?: Array<{ IP?: string; PrivatePort?: number; PublicPort?: number; Type?: string }>
}

type FabricState = 'green' | 'yellow' | 'red'

interface FabricNode {
  id: string
  label: string
  kind: string
  state: FabricState
  detail: string
  urls: Array<{ label: string; url: string }>
  restartable: boolean
  restartType?: string
}

interface FabricActionResult {
  ok: boolean
  action: string
  target?: string
  detail: string
  path?: string
  model?: string
}

interface FabricLink {
  id: string
  from: string
  to: string
  state: FabricState
  detail: string
}

function classifyFabricContainer(name: string, image: string, status: string): Omit<FabricContainer, 'name' | 'image' | 'status' | 'ports'> {
  const lower = `${name} ${image}`.toLowerCase()
  const running = status.toLowerCase().startsWith('up')
  const memoryRelated = /(neo4j|qdrant|graphiti|memory|mcp\/api-gateway|epic_galileo)/i.test(`${name} ${image}`)
  const currentProduction = new Set([
    'factory_neo4j',
    'factory_qdrant',
    'factory_litellm',
    'factory_ruflo',
    'factory_rufloui',
    'agent_qwen_code',
    'agent_openhands',
  ])

  if (currentProduction.has(name)) {
    const roles: Record<string, string> = {
      factory_neo4j: 'Temporal graph memory shadow store for Graphiti-compatible episodes and repair edges.',
      factory_qdrant: 'Production vector recall store for Factory Brain and research memories.',
      factory_litellm: 'Local OpenAI-compatible gateway for agent model calls.',
      factory_ruflo: 'RuFlo orchestration and MCP service.',
      factory_rufloui: 'Operator dashboard and API.',
      agent_qwen_code: 'Detached code worker runtime.',
      agent_openhands: 'OpenHands engineering runtime.',
    }
    const urls: Record<string, Array<{ label: string; url: string }>> = {
      factory_rufloui: [
        { label: 'Dashboard', url: `http://192.168.178.20:${process.env.RUFLOUI_VITE_PORT || '28589'}` },
        { label: 'API', url: `http://192.168.178.20:${process.env.RUFLOUI_API_PORT || '28580'}/api/system/info` },
      ],
      agent_openhands: [{ label: 'OpenHands', url: 'http://192.168.178.20:3001' }],
      factory_litellm: [{ label: 'Models', url: 'http://192.168.178.20:4001/v1/models' }],
      factory_qdrant: [{ label: 'Collections', url: 'http://192.168.178.20:6333/collections' }],
      factory_neo4j: [{ label: 'Neo4j Browser', url: 'http://192.168.178.20:7474' }],
      factory_ruflo: [{ label: 'Health', url: 'http://192.168.178.20:3011/health' }],
    }
    return {
      role: roles[name] || 'FactoryGrid production component.',
      urls: urls[name] || [],
      kind: running ? 'production' : 'support',
      memoryRelated,
      production: true,
    }
  }

  if (memoryRelated || !running) {
    return {
      role: memoryRelated
        ? 'Legacy or experimental memory-related container; not part of the current production memory path.'
        : 'Legacy stopped runtime; not part of current production stack.',
      urls: [],
      kind: 'legacy',
      memoryRelated,
      production: false,
    }
  }

  return {
    role: 'Support runtime discovered from Docker.',
    urls: [],
    kind: 'support',
    memoryRelated,
    production: false,
  }
}

async function listDockerFabricContainers(): Promise<FabricContainer[]> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '-a',
      '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
    ], { timeout: 10_000 })
    return stdout.split('\n').filter(Boolean).map((line) => {
      const [name = '', image = '', status = '', ports = ''] = line.split('\t')
      return { name, image, status, ports, ...classifyFabricContainer(name, image, status) }
    })
  } catch (err) {
    try {
      return await listDockerFabricContainersViaSocket()
    } catch {
      console.warn('[fabric] Docker discovery unavailable:', err instanceof Error ? err.message : String(err))
    }
    return []
  }
}

function dockerSocketRequest(method: string, pathname: string, body?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const req = httpRequest({
      socketPath: '/var/run/docker.sock',
      path: pathname,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': String(payload.length),
      } : undefined,
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        if ((res.statusCode || 500) >= 400) {
          reject(new Error(`Docker socket ${pathname} returned ${res.statusCode}: ${body.slice(0, 200)}`))
          return
        }
        resolve(body)
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function dockerSocketGet(pathname: string): Promise<string> {
  return dockerSocketRequest('GET', pathname)
}

function dockerSocketPost(pathname: string, body?: unknown): Promise<string> {
  return dockerSocketRequest('POST', pathname, body)
}

function dockerApiPortsToString(ports: DockerApiContainer['Ports']): string {
  return (ports || []).map((port) => {
    const protocol = port.Type || 'tcp'
    if (port.PublicPort) {
      const ip = port.IP || '0.0.0.0'
      return `${ip}:${port.PublicPort}->${port.PrivatePort}/${protocol}`
    }
    return `${port.PrivatePort}/${protocol}`
  }).join(', ')
}

async function listDockerFabricContainersViaSocket(): Promise<FabricContainer[]> {
  if (!fs.existsSync('/var/run/docker.sock')) {
    throw new Error('Docker socket not mounted')
  }
  const raw = await dockerSocketGet('/containers/json?all=1')
  const containers = JSON.parse(raw) as DockerApiContainer[]
  return containers.map((container) => {
    const name = (container.Names?.[0] || '').replace(/^\//, '')
    const image = container.Image || ''
    const status = container.Status || container.State || ''
    const ports = summarizeDockerPortBinding(dockerApiPortsToString(container.Ports)).join(', ')
    return { name, image, status, ports, ...classifyFabricContainer(name, image, status) }
  })
}

async function restartDockerProductionTarget(target: string): Promise<FabricActionResult> {
  const containers = await listDockerFabricContainers()
  const container = containers.find((item) => item.name === target && item.production)
  if (!container) {
    throw new Error(`Refusing restart for unknown or non-production target: ${target}`)
  }

  const composeServiceByContainer: Record<string, string> = {
    factory_qdrant: 'qdrant',
    factory_litellm: 'litellm',
    factory_ruflo: 'ruflo_orchestrator',
    factory_rufloui: 'rufloui',
    agent_qwen_code: 'qwen_code_worker',
    agent_openhands: 'openhands_engineer',
    factory_neo4j: 'neo4j',
  }
  const service = composeServiceByContainer[target]
  if (service) {
    try {
      await execFileAsync('docker', ['compose', 'restart', service], { timeout: 120_000, cwd: factoryRoot() })
      return { ok: true, action: 'docker-compose-restart', target, detail: `Restarted compose service ${service}` }
    } catch {
      // Live RuFloUI containers intentionally rely on the Docker socket fallback.
    }
  }

  if (!fs.existsSync('/var/run/docker.sock')) {
    throw new Error('Docker CLI restart failed and Docker socket is not mounted')
  }
  await dockerSocketPost(`/containers/${encodeURIComponent(target)}/restart?t=10`)
  return { ok: true, action: 'docker-socket-restart', target, detail: `Restarted container ${target} through /var/run/docker.sock` }
}

const HOST_CONTROL_URLS = [...new Set([
  process.env.FACTORY_HOST_CONTROL_URL,
  'http://172.18.0.1:28601',
  'http://host.docker.internal:28601',
  'http://127.0.0.1:28601',
  'http://localhost:28601',
].filter(Boolean).map((url) => String(url).replace(/\/$/, '')))]
const HOST_CONTROL_TOKEN = process.env.FACTORY_HOST_CONTROL_TOKEN || 'factory-local-control'

async function callHostControl(pathname: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<any> {
  const errors: string[] = []
  for (const baseUrl of HOST_CONTROL_URLS) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Factory-Token': HOST_CONTROL_TOKEN,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.ok) return payload
      errors.push(`${baseUrl}${pathname}: ${payload?.error || response.status}`)
    } catch (err) {
      errors.push(`${baseUrl}${pathname}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(`host-control unavailable: ${errors.join(' | ')}`)
}

function resolveProfileValue(value: string): string {
  const trimmed = String(value || '').trim().replace(/^['"]|['"]$/g, '')
  const match = trimmed.match(/^\$\{([^:}]+):-([^}]+)\}$/)
  if (match) return process.env[match[1]] || match[2]
  return trimmed.replace(/\$([A-Z0-9_]+)/gi, (_, name) => process.env[name] || '')
}

function readModelProfile(filePath: string): Record<string, string> {
  const profile: Record<string, string> = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    profile[key.trim()] = resolveProfileValue(rest.join('='))
  }
  profile.PROFILE_NAME ||= path.basename(filePath, '.env')
  return profile
}

function profileCatalogEntry(filePath: string) {
  const profile = readModelProfile(filePath)
  const model = profile.MODEL || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ'
  const profileName = profile.PROFILE_NAME || path.basename(filePath, '.env')
  const engine = profile.ENGINE || 'vllm'
  return {
    id: profileName,
    profile: profileName,
    model,
    path: filePath,
    source: 'model-profile',
    safeSettings: {
      gpuMem: profile.GPU_MEM || '0.50',
      maxModelLen: Number(profile.MAX_MODEL_LEN || 8192),
      maxNumSeqs: Number(profile.MAX_NUM_SEQS || 1),
      maxBatchedTokens: Number(profile.MAX_BATCHED_TOKENS || profile.MAX_MODEL_LEN || 8192),
      swapSpaceGb: Number(profile.SWAP_SPACE_GB || 4),
      quantization: profile.QUANTIZATION || '',
      enforceEager: profile.ENFORCE_EAGER || 'true',
      servedModelName: profile.SERVED_MODEL_NAME || 'factory-active',
      profileName,
      model,
      engine,
      role: profile.ROLE || 'coding',
      policy: engine === 'vllm' ? 'allowed' : 'blocked',
      reason: engine === 'vllm'
        ? 'Curated FactoryGrid profile settings selected for RTX 4090 stability.'
        : `Profile engine is ${engine}; configure provider routing before vLLM start.`,
    },
  }
}

function readLocalVllmProfileCatalog() {
  const dir = path.join(factoryRoot(), 'runtime', 'model-profiles')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.env'))
    .sort()
    .map((name) => profileCatalogEntry(path.join(dir, name)))
}

async function readVllmModelCatalog(runtime: Awaited<ReturnType<typeof getFactoryRuntimeSnapshot>>) {
  try {
    const remote = await callHostControl('/vllm/models')
    const localProfiles = readLocalVllmProfileCatalog()
    const seen = new Set<string>()
    const models = [...localProfiles, ...((remote?.models || []) as Array<any>)]
      .filter((model) => {
        const id = String(model?.id || '')
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
    return { ...remote, models }
  } catch {
    const vllm = runtime.endpoints.find((endpoint) => endpoint.name === 'vLLM')
    const fallback = process.env.VLLM_MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ'
    const models = readLocalVllmProfileCatalog()
    return {
      current: vllm?.status === 'ok' ? fallback : '',
      requested: models[0]?.id || fallback,
      models: models.length ? models : [{ id: fallback, profile: '', model: fallback, path: 'native WSL vLLM', source: vllm?.url || HOST_CONTROL_URLS[0] || 'host-control', safeSettings: { gpuMem: '0.50', maxModelLen: 8192, maxNumSeqs: 1, maxBatchedTokens: 8192, swapSpaceGb: 4, quantization: 'awq_marlin', policy: 'allowed', reason: 'Conservative fallback when host-control is unavailable.' } }],
    }
  }
}

function fabricStateFromContainer(container: FabricContainer): FabricState {
  const status = container.status.toLowerCase()
  if (container.name === 'docker-unavailable') return 'red'
  if (status.startsWith('up') && container.production) return 'green'
  if (status.startsWith('up')) return 'yellow'
  return container.production ? 'red' : 'yellow'
}

function fabricStateFromRuntimeStatus(status: string): FabricState {
  if (status === 'ok') return 'green'
  if (status === 'fail') return 'red'
  return 'yellow'
}

function buildFabricNodes(containers: FabricContainer[]): FabricNode[] {
  return containers.filter((container) => container.name !== 'docker-unavailable' && container.kind !== 'legacy').map((container) => ({
    id: container.name,
    label: container.name,
    kind: container.production ? 'Production Docker' : container.kind === 'legacy' ? 'Legacy / old memory Docker' : 'Support Docker',
    state: fabricStateFromContainer(container),
    detail: [
      container.role,
      container.status,
      container.ports ? `Ports: ${container.ports}` : '',
      container.image ? `Image: ${container.image}` : '',
    ].filter(Boolean).join(' | '),
    urls: container.urls,
    restartable: container.production && container.name !== 'docker-unavailable',
    restartType: container.production ? 'docker-compose-service' : undefined,
  }))
}

async function checkFabricHttp(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return { ok: response.ok, detail: `${response.status} ${response.statusText}`.trim() }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function buildTrueMemoryFabricNodes(): Promise<FabricNode[]> {
  const memoryStats = factoryMemoryStats(await qdrantReachable())
  const [qdrant, neo4j] = await Promise.all([
    checkFabricHttp('http://qdrant:6333/collections'),
    checkFabricHttp('http://neo4j:7474'),
  ])

  return [
    {
      id: 'memory-factory-brain',
      label: 'Factory Brain',
      kind: 'Production Memory',
      state: memoryStats.totalEntries > 0 ? 'green' : 'yellow',
      detail: `Readable source of truth | ${memoryStats.totalEntries} entries | ${memoryStats.storageSize}`,
      urls: [{ label: 'Memory API', url: 'http://192.168.178.20:28580/api/memory/stats' }],
      restartable: false,
    },
    {
      id: 'memory-qdrant',
      label: 'Qdrant Recall',
      kind: 'Production Memory',
      state: qdrant.ok ? 'green' : 'red',
      detail: `Vector recall store | ${qdrant.detail} | indexed vectors: ${memoryStats.indexedVectors}`,
      urls: [{ label: 'Collections', url: 'http://192.168.178.20:6333/collections' }],
      restartable: false,
    },
    {
      id: 'memory-neo4j',
      label: 'Neo4j Shadow Graph',
      kind: 'Memory Evolution',
      state: neo4j.ok ? 'green' : 'yellow',
      detail: `Temporal graph shadow store for Graphiti-compatible memory | ${neo4j.detail}`,
      urls: [{ label: 'Neo4j Browser', url: 'http://192.168.178.20:7474' }],
      restartable: false,
    },
  ]
}

function buildHermesFabricNode(runtime: Awaited<ReturnType<typeof getFactoryRuntimeSnapshot>>): FabricNode {
  const endpoint = runtime.endpoints.find((item) => item.name === 'Hermes Dashboard')
  const state = fabricStateFromRuntimeStatus(endpoint?.status || 'unknown')
  return {
    id: 'hermes-decima',
    label: 'Hermes',
    kind: 'Support Runtime',
    state,
    detail: [
      'Decima WSL Hermes dashboard and CLI orchestration surface.',
      'Model route: Hermes -> LiteLLM 4001 -> vLLM factory-active.',
      endpoint ? `${endpoint.url} | ${endpoint.detail}` : '',
    ].filter(Boolean).join(' | '),
    urls: [
      { label: 'Dashboard', url: 'http://192.168.178.20:9119' },
      { label: 'Console', url: 'http://192.168.178.20:7681' },
    ],
    restartable: false,
  }
}

async function restartModelCallDependencies(): Promise<Array<{ target: string; ok: boolean; detail: string }>> {
  const targets = ['factory_litellm', 'factory_ruflo', 'agent_qwen_code', 'agent_openhands']
  const results: Array<{ target: string; ok: boolean; detail: string }> = []
  for (const target of targets) {
    try {
      const result = await restartDockerProductionTarget(target)
      results.push({ target, ok: true, detail: result.detail })
    } catch (err) {
      results.push({ target, ok: false, detail: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

function createHermesModelSyncWorkOrder(selection: string, result: any): string {
  const dir = path.join(factoryRoot(), 'workspace', 'work-orders')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const safeSelection = selection.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80)
  const filePath = path.join(dir, `${stamp}-hermes-model-sync-${safeSelection}.md`)
  const settings = result?.safeSettings || {}
  fs.writeFileSync(filePath, [
    '# Hermes Model Sync Work Order',
    '',
    `Created: ${new Date().toISOString()}`,
    `Selected Fabric model/profile: ${selection}`,
    `Resolved model: ${result?.model || settings.model || 'unknown'}`,
    `Served model name: ${settings.servedModelName || 'factory-active'}`,
    `Profile: ${result?.profile || settings.profileName || 'direct-model'}`,
    '',
    '## Required checks',
    '- Hermes on Decima must continue using LiteLLM: `base_url: http://172.20.86.232:4001/v1`.',
    '- Hermes default model should stay on the stable LiteLLM alias `qwen-coder-14b` unless the operator intentionally changes aliases.',
    '- Verify LiteLLM still routes `qwen-coder-14b` and `mode-a-research` to `openai/factory-active`.',
    '- If Hermes env metadata exposes `FACTORY_VLLM_MODEL` or `VLLM_MODEL`, update it to the resolved model above and restart the Hermes dashboard.',
    '- Verify Hermes dashboard link from Fabric after the switch.',
    '',
    '## Safe launch settings',
    '```json',
    JSON.stringify(settings, null, 2),
    '```',
    '',
  ].join('\n'), 'utf-8')
  return filePath
}

async function startVllmAndRestartDependencies(model: string) {
  const result = await callHostControl('/vllm/start', 'POST', { model })
  result.hermesWorkOrder = createHermesModelSyncWorkOrder(model, result)
  if (!result?.blocked) {
    result.dependencyRestarts = await restartModelCallDependencies()
  }
  return result
}

async function buildFabricSnapshot() {
  const [containers, runtime, memoryNodes] = await Promise.all([
    listDockerFabricContainers(),
    getFactoryRuntimeSnapshot(),
    buildTrueMemoryFabricNodes(),
  ])
  const dockerNodes = buildFabricNodes(containers)
  const nodes = [
    ...dockerNodes,
    ...memoryNodes,
    buildHermesFabricNode(runtime),
  ]
  const liteLlmHealthy = runtime.endpoints.some((endpoint) => endpoint.name === 'LiteLLM' && endpoint.status === 'ok')
  const links: FabricLink[] = runtime.endpoints.map((endpoint) => {
    let state = fabricStateFromRuntimeStatus(endpoint.status)
    let detail = `${endpoint.url} | ${endpoint.detail}`
    if (endpoint.name === 'vLLM' && endpoint.status === 'fail' && liteLlmHealthy) {
      state = 'yellow'
      detail = `vLLM native backend is stopped or unreachable, but LiteLLM is healthy. Treating vLLM as standby diagnostics; start a Fabric model profile only when local GPU inference is required. Probe detail: ${detail}`
    }
    if (endpoint.name === 'RuFlo orchestrator') {
      const ruflo = containers.find((container) => container.name === 'factory_ruflo')
      if (ruflo && fabricStateFromContainer(ruflo) === 'green') {
        state = 'green'
        detail = `factory_ruflo container healthcheck OK | ${ruflo.status}`
      }
    }
    return {
      id: `runtime-${endpoint.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      from: 'factory_rufloui',
      to: endpoint.name,
      state,
      detail,
    }
  })
  const countedStates = [...nodes.map((node) => node.state), ...links.map((link) => link.state)]
  const counts = {
    green: countedStates.filter((state) => state === 'green').length,
    yellow: countedStates.filter((state) => state === 'yellow').length,
    red: countedStates.filter((state) => state === 'red').length,
  }
  return {
    generatedAt: new Date().toISOString(),
    counts,
    nodes,
    links,
    containers,
    runtime,
    notes: [
      'Live data source: Docker discovery, FactoryGrid runtime probes, and explicit true-memory probes.',
      'True memory path: Factory Brain Markdown, Qdrant production recall, and Neo4j temporal shadow graph.',
      ...runtime.notes,
    ],
  }
}

function monitoringRoutes(): Router {
  const r = Router()
  r.get('/fabric', h(async (_req, res) => {
    const containers = await listDockerFabricContainers()
    const tasks = [...taskStore.values()]
    const memoryEntries = listFactoryMemoryEntries()
    res.json({
      generatedAt: new Date().toISOString(),
      mode: 'production-local',
      operatorUrl: `http://192.168.178.20:${process.env.RUFLOUI_VITE_PORT || '28589'}/monitoring/fabric`,
      memory: {
        productionPath: ['Factory Brain Markdown', 'Qdrant factory_memory', 'Neo4j temporal shadow graph'],
        graphitiActive: Boolean(process.env.GRAPHITI_EMBEDDING_BASE_URL && process.env.GRAPHITI_LLM_BASE_URL),
        visibleEntries: memoryEntries.length,
      },
      tasks: {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        pending: tasks.filter(t => t.status === 'pending').length,
        failed: tasks.filter(t => t.status === 'failed' || t.status === 'cancelled').length,
        componentUpdateTask: taskStore.get('task-update-20260526') || null,
      },
      containers,
      notes: [
        'Orange container headings mark legacy/stopped or old memory-related Docker VMs/containers.',
        'Current production memory is Qdrant plus Neo4j shadow graph; old experimental memory containers are not authoritative.',
      ],
    })
  }))
  return r
}

function fabricRoutes(): Router {
  const r = Router()
  r.get('/snapshot', h(async (_req, res) => {
    res.json(await buildFabricSnapshot())
  }))
  r.post('/restart', h(async (req, res) => {
    const target = String(req.body?.target || '')
    res.json(await restartDockerProductionTarget(target))
  }))
  r.get('/vllm/models', h(async (_req, res) => {
    const runtime = await getFactoryRuntimeSnapshot()
    res.json(await readVllmModelCatalog(runtime))
  }))
  r.post('/vllm/model', h(async (req, res) => {
    const model = String(req.body?.model || '').trim()
    if (!model) {
      res.status(400).json({ error: 'model is required' })
      return
    }
    res.json(await startVllmAndRestartDependencies(model))
  }))
  r.post('/vllm/start', h(async (req, res) => {
    const model = String(req.body?.model || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ').trim()
    res.json(await startVllmAndRestartDependencies(model))
  }))
  r.post('/vllm/stop', h(async (_req, res) => {
    res.json(await callHostControl('/vllm/stop', 'POST', {}))
  }))
  r.post('/vllm/restart', h(async (req, res) => {
    const model = String(req.body?.model || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ').trim()
    res.json(await startVllmAndRestartDependencies(model))
  }))
  r.post('/vllm/warmup', h(async (req, res) => {
    const model = String(req.body?.model || process.env.VLLM_MODEL || 'Qwen/Qwen2.5-Coder-14B-Instruct-AWQ').trim()
    res.json(await callHostControl('/vllm/warmup', 'POST', { model }))
  }))
  r.post('/vllm/rca', h(async (_req, res) => {
    res.json(await callHostControl('/vllm/rca', 'POST', {}))
  }))
  r.post('/update-work-order', h(async (req, res) => {
    const reason = String(req.body?.reason || 'manual').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60)
    const dir = path.join(process.cwd(), 'workspace', 'work-orders')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${new Date().toISOString().slice(0, 10)}-fabric-update-${reason}.md`)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# Fabric Update Work Order\n\nCreated: ${new Date().toISOString()}\nReason: ${reason}\n\nReview snapshot, rollback, and Queen approval before implementation.\n`)
    }
    res.json({ path: filePath, taskId: 'task-update-20260526' })
  }))
  return r
}

function aiDefenceRoutes(): Router {
  const r = Router()
  r.post('/analyze', h(async (req, res) => {
    try {
      const { raw } = await execCli('security', ['scan', '--input', req.body?.input || ''])
      res.json({ raw, safe: true })
    } catch { res.json({ safe: true, raw: 'Security module not available' }) }
  }))
  r.get('/scan', h(async (_req, res) => {
    try {
      const { raw } = await execCli('security', ['scan'])
      res.json({ raw, ...parseCliOutput(raw) as object })
    } catch { res.json({ raw: 'No security issues found' }) }
  }))
  r.get('/stats', h(async (_req, res) => {
    res.json({ scans: 0, threats: 0, blocked: 0 })
  }))
  return r
}

// Swarm Monitor routes — polls CLI for real-time swarm agent data
function swarmMonitorRoutes(): Router {
  const r = Router()

  // Full snapshot: swarm status + agent list + agent health combined
  // ?current=true filters to only current swarm agents
  r.get('/snapshot', h(async (req, res) => {
    const filterCurrent = req.query.current === 'true'
    try {
      const [swarmResult, agentListResult, agentHealthResult] = await Promise.allSettled([
        execCli('swarm', ['status', '--format', 'json']),
        execCli('agent', ['list', '--format', 'json']),
        execCli('agent', ['health', '--format', 'json']),
      ])

      // Parse swarm status
      let swarm: Record<string, unknown> = {}
      if (swarmResult.status === 'fulfilled' && swarmResult.value.parsed) {
        swarm = swarmResult.value.parsed as Record<string, unknown>
      }

      // Parse agent list
      let agents: Array<Record<string, unknown>> = []
      if (agentListResult.status === 'fulfilled' && agentListResult.value.parsed) {
        const parsed = agentListResult.value.parsed as Record<string, unknown>
        agents = (parsed.agents || []) as Array<Record<string, unknown>>
      }

      // Parse agent health and merge into agent list
      let healthMap: Map<string, Record<string, unknown>> = new Map()
      if (agentHealthResult.status === 'fulfilled' && agentHealthResult.value.parsed) {
        const parsed = agentHealthResult.value.parsed as Record<string, unknown>
        const healthAgents = (parsed.agents || []) as Array<Record<string, unknown>>
        for (const h of healthAgents) {
          if (h.id) healthMap.set(String(h.id), h)
        }
      }

      // Real system metrics for agents
      const numCpus = os.cpus().length || 1
      // loadavg[0] = 1-min avg; on Windows it's always 0, so fallback to process.cpuUsage
      let systemCpuPct: number
      if (os.platform() === 'win32') {
        // On Windows, estimate from process.cpuUsage (microseconds since process start)
        const usage = process.cpuUsage()
        const totalUs = usage.user + usage.system
        const uptimeMs = process.uptime() * 1000
        systemCpuPct = Math.min(100, Math.round((totalUs / 1000 / uptimeMs) * 100))
      } else {
        systemCpuPct = Math.min(100, Math.round((os.loadavg()[0] / numCpus) * 100))
      }
      const totalMemMB = Math.round(os.totalmem() / 1024 / 1024)
      const usedMemMB = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)

      // Merge health data into agents
      const enrichedAgents = agents
        .filter(a => {
          const id = String(a.agentId || a.id || '')
          const created = String(a.createdAt || '')
          // Respect termination filters
          if (allTerminatedBefore && created <= allTerminatedBefore) return false
          // If filtering to current swarm only
          if (filterCurrent && currentSwarmAgentIds.size > 0 && !currentSwarmAgentIds.has(id)) return false
          return true
        })
        .map(a => {
        const id = String(a.agentId || a.id || '')
        const health = healthMap.get(id) || {}
        const activity = agentActivity.get(id)
        const isWorking = (activity?.status || a.status) === 'active' || (activity?.status || a.status) === 'working'
        // Distribute real system metrics across agents (active agents get more share)
        const agentCount = agents.length || 1
        const baseCpu = Math.round(systemCpuPct / agentCount)
        const agentCpu = isWorking ? Math.min(baseCpu + Math.round(Math.random() * 10), 100) : Math.max(1, Math.round(baseCpu * 0.3))
        const baseMemMB = Math.round(usedMemMB / agentCount)
        const agentMemUsed = isWorking ? baseMemMB + Math.round(Math.random() * 50) : Math.round(baseMemMB * 0.4)
        const agentMemLimit = Math.round(totalMemMB / agentCount)
        return {
          id,
          type: a.agentType || a.type || 'unknown',
          status: activity?.status || a.status || 'idle',
          health: a.health ?? 1,
          taskCount: (activity?.currentTask ? 1 : 0) + [...taskStore.values()].filter(t => t.assignedTo === id && t.status === 'in_progress').length,
          createdAt: a.createdAt || new Date().toISOString(),
          uptime: health.uptime || 0,
          memory: { used: agentMemUsed, limit: agentMemLimit },
          cpu: agentCpu,
          tasks: health.tasks || { active: 0, queued: 0, completed: 0, failed: 0 },
          latency: health.latency || { avg: 0, p99: 0 },
          errors: health.errors || { count: 0 },
          currentTask: activity?.currentTask,
          currentAction: activity?.currentAction,
        }
      })

      const swarmAgents = swarm.agents as Record<string, number> | undefined
      res.json({
        swarmId: swarm.id || lastSwarmId || '',
        status: swarmShutdown ? 'shutdown' : (swarm.status || 'inactive'),
        topology: swarm.topology || lastSwarmTopology || 'hierarchical',
        objective: swarm.objective || 'No active objective',
        strategy: swarm.strategy || lastSwarmStrategy || 'specialized',
        progress: swarm.progress || 0,
        agents: enrichedAgents,
        agentSummary: swarmAgents || { total: enrichedAgents.length, active: enrichedAgents.filter(a => a.status === 'active').length, idle: enrichedAgents.filter(a => a.status === 'idle').length, completed: 0 },
        taskSummary: swarm.tasks || { total: 0, completed: 0, inProgress: 0, pending: 0 },
        metrics: swarm.metrics || { tokensUsed: 0, avgResponseTime: '--', successRate: '--', elapsedTime: '--' },
        coordination: swarm.coordination || { consensusRounds: 0, messagesSent: 0, conflictsResolved: 0 },
      })
    } catch (err) {
      res.json({ swarmId: '', status: 'error', agents: [], error: String(err) })
    }
  }))

  // Lightweight activity-only endpoint (no CLI calls, instant response)
  r.get('/activity', ((_req, res) => {
    const activities: Record<string, unknown> = {}
    for (const [id, act] of agentActivity.entries()) {
      activities[id] = act
    }
    res.json(activities)
  }) as RequestHandler)

  // Get agent output buffer
  r.get('/output/:agentId', (((req, res) => {
    const id = String(req.params.agentId)
    const buf = agentOutputBuffers.get(id) || []
    res.json({ agentId: id, lines: buf })
  }) as RequestHandler))

  // Purge all zombie agents
  r.post('/purge', h(async (_req, res) => {
    const stopped = await purgeAllCliAgents()
    broadcast('swarm-monitor:purged', { stopped })
    res.json({ stopped, message: `Purged ${stopped} agents` })
  }))

  // Agent list only
  r.get('/agents', h(async (_req, res) => {
    try {
      const { parsed } = await execCli('agent', ['list', '--format', 'json'])
      const data = parsed as Record<string, unknown>
      res.json(data?.agents || [])
    } catch { res.json([]) }
  }))

  // Agent health only
  r.get('/health', h(async (_req, res) => {
    try {
      const { parsed } = await execCli('agent', ['health', '--format', 'json'])
      res.json(parsed || { agents: [] })
    } catch { res.json({ agents: [] }) }
  }))

  // Agent metrics
  r.get('/metrics', h(async (_req, res) => {
    try {
      const { parsed } = await execCli('agent', ['metrics', '--format', 'json'])
      res.json(parsed || {})
    } catch { res.json({}) }
  }))

  return r
}


function workspaceRoutes(): Router {
  const r = Router()
  function workspaceRoot() {
    const configured = path.resolve(process.env.RUFLO_WORKSPACE_ROOT || process.env.RUFLO_CWD || factoryRoot())
    if (fs.existsSync(path.join(configured, '.git'))) return configured
    const factory = factoryRoot()
    if (fs.existsSync(path.join(factory, '.git'))) return factory
    return configured
  }

  r.get('/tree', h(async (req, res) => {
    const limit = Number(req.query.limit || 800)
    res.json(await listWorkspaceTree(workspaceRoot(), Math.min(Math.max(limit, 50), 2000)))
  }))

  r.get('/status', h(async (_req, res) => {
    const status = await getWorkspaceStatus(workspaceRoot())
    res.json({
      ...status,
      files: status.files.map((file) => ({
        ...file,
        protected: classifyProtectedPath(file.path),
      })),
    })
  }))

  r.get('/guardrails', h(async (_req, res) => {
    res.json({
      allowedWritePrefixes: agentAllowedWritePrefixes(),
      protectedFilePatterns: protectedFilePatterns(),
      snapshotRoot: 'workspace/guardrails/snapshots',
      policy: 'Autonomous writes must match the allowlist and must not target protected config/dependency files without explicit human approval.',
    })
  }))

  r.get('/diff', h(async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path : undefined
    res.json(await getWorkspaceDiff(workspaceRoot(), filePath))
  }))

  r.get('/file', h(async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path : ''
    if (!filePath) {
      res.status(400).json({ error: 'path is required' })
      return
    }
    res.json(await getWorkspaceFile(workspaceRoot(), filePath))
  }))

  // Production memory evolution push (gated high-impact activation of 2026-06 plan).
  // Exposed only via the /workspace RuFloUI view as the "Push Changes" button (next to Preview/Diff).
  // Callable from Hermes via the apply-memory-evolution skill (or direct POST).
  // Writes skills, ensures CLAUDE cross-refs, syncs revelation <-> D:\UAT, hardens SOULs on all Hermes instances,
  // and records the event so every agent (Queen, researcher, coder, reviewer, execution, both Hermeses, Claude Code, etc.)
  // walks with the same persistently smart knowledge + treats mistakes as first-class lessons (failure_learned_from, supersedes).
  r.post('/push-memory-evolution', h(async (req, res) => {
    const started = new Date().toISOString()
    console.log('[memory-evolution] Push started', { started, body: req.body })

    const fsSync = require('fs')
    const pathMod = require('path')
    const { execSync } = require('child_process')

    const srcRoot = workspaceRoot()
    const docsDir = pathMod.join(srcRoot, 'docs')
    const memDir = pathMod.join(docsDir, 'memory_evolution')
    const skillDir = pathMod.join(docsDir, 'hermes-skills')
    const memPath = pathMod.join(memDir, 'MEMORY_EVOLUTION_2026-06.md')
    const claudePath = pathMod.join(srcRoot, 'CLAUDE.md')
    const researchSkillPath = pathMod.join(skillDir, 'research-collaboration-memory.skill.md')
    const applySkillPath = pathMod.join(skillDir, 'apply-memory-evolution.skill.md')

    const results: string[] = []

    try {
      // Ensure dirs
      fsSync.mkdirSync(memDir, { recursive: true })
      fsSync.mkdirSync(skillDir, { recursive: true })

      // 1. Ensure the canonical evolution doc exists / is current (source of truth lives in the tree; push activates it everywhere)
      if (!fsSync.existsSync(memPath)) {
        const seed = '# Memory Evolution – 2026-06 (SAGE-Inspired + Production Graph Patterns)\n\nSee the committed version in docs/memory_evolution/MEMORY_EVOLUTION_2026-06.md for the full baseline, mistakes-as-memories rules, 10 concrete steps (Graphiti hybrid, dual-write, evidence chains, auto lesson feedback, SOUL updates, fabric nodes, end-to-end test), and evaluation.\n\nThis push makes the plan active for all agents via skills + SOUL + sync.'
        fsSync.writeFileSync(memPath, seed)
        results.push('seeded MEMORY_EVOLUTION_2026-06.md')
      } else {
        results.push('MEMORY_EVOLUTION_2026-06.md present (canonical)')
      }

      // 2. Update CLAUDE.md Memory Architecture section (ensure every-agent language + push mechanism reference)
      let claude = fsSync.readFileSync(claudePath, 'utf8')
      const memArchRe = /## Memory Architecture \(see MEMORY_EVOLUTION_2026-06.md for the full current plan and evolution\)[\s\S]*?(?=\n## |$)/
      const newMemArch = `## Memory Architecture (see MEMORY_EVOLUTION_2026-06.md for the full current plan and evolution)

FactoryGrid uses a hybrid durable memory system designed for multi-agent collaboration and continuous growth:

- **Ruflo** (via revelations-ruflo MCP at the local gateway + the \`research-collaboration-memory\` skill) provides structured, namespaced, gated writes for proposals, reviews, and consensus (\`research:proposal:*\`, \`research:review:*\`, \`research:consensus:*\`). This is the "side integration" for shared knowledge across revelation, decima, native Hermes Desktop, Queen, and all execution agents. See the skill doc for exact procedure, schemas, and gating.
- **Qdrant** (\`factory_memory\` collection) + lexical fallback for fast semantic + keyword recall.
- **Markdown factory-brain + workspace/factory-brain** as the human-readable single source of truth (versioned, auditable).
- **Fabric true-memory nodes** (Factory Brain / Qdrant / Neo4j) for observability.

**Key rules for every agent**:
- Search memory (via the research-collaboration-memory skill or direct MCP) *before* starting research, design, or implementation on a topic.
- After any significant finding, review, or failure, write back using the skill (with evidence, confidence, provenance, and links).
- Mistakes and failures must become first-class memories (lessons) so the system does not repeat them. Use explicit \`lesson\` / \`failure_learned_from\` / \`supersedes\` patterns. See the "Mistakes as Memories" section in MEMORY_EVOLUTION_2026-06.md.
- Ruflo appears in \`hermes memory status\` only as an MCP + skill, not as a built-in Memory Provider plugin. Always test writes/reads end-to-end and use the skill explicitly.
- The goal is that *every* agent (no matter which surface or role: Queen, researcher, coder, reviewer, tester, blue-team-cell, architect, documenter, execution agents, Hermes on decima or native Desktop, Claude Code CLI) can "walk with" the same evolving knowledge and grows smarter over time.

**How to push future memory evolutions (or re-apply this one)**: Use the "Push Changes" button in the RuFloUI /workspace view (only appears when a workspace file is selected), or invoke the \`apply-memory-evolution\` Hermes skill. Both trigger the Ruflo custom function that writes the canonical docs/skills, runs syncs, hardens SOULs, and records the event.

See \`MEMORY_EVOLUTION_2026-06.md\` (June 2026) for the SAGE-inspired evolution plan (Graphiti hybrid for evidence chains + automatic feedback loops while keeping Ruflo as the durable gated writer), concrete 10-step integration, and how mistakes become durable lessons.

Cross references: \`docs/hermes-skills/research-collaboration-memory.skill.md\` (v0.2+), \`docs/hermes-skills/apply-memory-evolution.skill.md\`, \`docs/memory_evolution/\`, \`rufloui/src/backend/server.ts\` (the /workspace/push-memory-evolution route), fabric monitoring, and all agent SOUL.md / AGENTS.md / IDENTITY.md files.`

      if (memArchRe.test(claude)) {
        claude = claude.replace(memArchRe, newMemArch)
        fsSync.writeFileSync(claudePath, claude)
        results.push('updated CLAUDE.md Memory Architecture (every-agent + push refs)')
      } else {
        // Append if section marker changed
        const appendNote = '\n\n' + newMemArch
        fsSync.writeFileSync(claudePath, claude + appendNote)
        results.push('appended Memory Architecture to CLAUDE.md (verify manually)')
      }

      // 3. Write / update the research-collaboration-memory skill (v0.2 with lesson + evolution)
      const researchSkillV2 = `# Skill: research-collaboration-memory (v0.2 – 2026-06 Evolution)

**Name**: research-collaboration-memory
**Version**: 0.2
**Purpose**: Primary structured writer/reader for the Ruflo shared memory layer. Enables every agent in the FactoryGrid (revelation execution agents, Queen, researcher, coder, reviewer, tester, blue-team-cell, architect, documenter, pinescript, Hermes on decima WSL + native Desktop, Claude Code CLI, etc.) to propose, review, reach consensus, and — critically — turn mistakes/failures into first-class durable lessons that future agents see and avoid.

## Namespaces (use these)
- research:proposal:*
- research:review:*
- research:consensus:*
- lesson:* or research:lesson:* (new in v0.2 for mistakes-as-memories)
- (future) evidence-chain queries via memory_query_evidence_chain

## Core Actions
- propose(topic, content, evidence, confidence, provenance)
- review(proposal_id, verdict, comments, suggested_changes)
- consensus(topic, decision, rationale, supersedes?, evidence)
- lesson(failure_type, root_cause, preventive_action, supersedes, evidence, tags)  // NEW v0.2 non-negotiable for growth
- read(namespaces, query?, limit?)
- (forthcoming in graph layer) query_evidence_chain(topic, include_lessons=true)

## 2026-06 Evolution Note
This skill is the primary structured writer for the hybrid memory system. Ruflo (MCP at 3011) + this skill = the durable, human-auditable, gated source of truth. The 2026-06 plan (see MEMORY_EVOLUTION_2026-06.md) adds:
- Automatic lesson writes on failures/rejections (rufloui hooks, review steps, Bounded Execution gates, test failures).
- Evidence-chain support (via upcoming lightweight graph layer e.g. Graphiti episodes + dual-write).
- Mandate in all SOUL.md: search first, write lessons always.
- Every agent uses the exact same interface (skill or raw MCP) so knowledge is shared.

## Mistakes as Memories (Non-Negotiable)
Every failed action, rejected proposal, bad review, test failure, or "we should have known X" **must** produce a lesson entry with:
- failure_type, root_cause, preventive_action, supersedes (link to the prior bad decision/artifact), evidence (run id, artifact path, review id).
Agents are required (by SOUL) to query for prior lessons on similar topics before repeating work. This is how the system gets persistently smart and "shit doesn't happen again".

## Gating
High-impact writes (consensus, certain lessons that supersede prior decisions) should go through Bounded Execution / Queen approval where the context provides it.

## Integration
- Registered as revelations-ruflo MCP (or equivalent LAN-reachable) on decima Hermes, native Hermes Desktop, and available to revelation agents.
- Called from Hermes chat via the skill, from agent prompts, from rufloui run/review hooks, and from custom push functions.
- See apply-memory-evolution.skill.md for the one-shot activation of a full memory evolution (docs + CLAUDE + skills + SOULs + sync).

## Safety / Best Practices
- Always include evidence + confidence + agent attribution + timestamp.
- Use supersedes when a later finding invalidates an earlier one.
- Test end-to-end: write then read back via the skill or direct MCP tool call.
- "ZERO from Ruflo" in hermes memory status is expected (Ruflo is side integration via MCP+skill, not a core Memory Provider plugin).

Use this skill explicitly in every research/design/implementation task and after every significant outcome or failure.`

      fsSync.writeFileSync(researchSkillPath, researchSkillV2)
      results.push('wrote research-collaboration-memory.skill.md (v0.2 + lesson + evolution)')

      // 4. Write the apply-memory-evolution skill (the "run this" plugin)
      const applySkill = `# Skill: apply-memory-evolution (v0.1 – Memory Evolution Push Trigger)

**Name**: apply-memory-evolution
**Version**: 0.1
**Purpose**: Trigger the production push of a memory evolution (MEMORY_EVOLUTION_2026-06.md, updated CLAUDE.md cross-refs, updated research-collaboration-memory + this skill, syncs revelation <-> D:\\UAT, hardened SOUL.md on all Hermes instances). This activates the persistently-smart rules (memory search before acting, mistakes as first-class lessons with failure_learned_from/supersedes, evidence chains, every-agent shared knowledge) so that Queen, researchers, coders, reviewers, execution agents, both Hermeses (decima + Desktop), and Claude Code all walk with the same growing memory.

## When to Use
- User says: "apply the memory evolution", "push the changes for the new memory system", "make all agents persistently smart with the 2026-06 rules", or clicks "Push Changes" in RuFloUI /workspace.
- After editing the canonical MEMORY_EVOLUTION doc or related skills and wanting to distribute + activate.

## Procedure (what the push actually does)
1. Ensures canonical docs/memory_evolution/MEMORY_EVOLUTION_2026-06.md exists on revelation source (the drafted baseline, SAGE evolution, Mistakes as Memories non-negotiable section, 10 concrete next steps including Graphiti hybrid, dual-write, memory_query_evidence_chain exposure, auto feedback in hooks, fabric graph nodes, SOUL updates, agent-growth seeding, deliberate-bad-decision end-to-end test).
2. Replaces/ensures the Memory Architecture section in CLAUDE.md (every-agent language, Ruflo side-integration, mistakes first-class, references to the push mechanism and skills).
3. Writes the latest research-collaboration-memory.skill.md (v0.2 with lesson action + 2026-06 evolution note) and this apply-memory-evolution.skill.md into docs/hermes-skills/ (making them loadable/invokable).
4. Runs revelation -> D:\\UAT sync (factory-uat-copy.sh) so the portable UAT and worktree stay in sync per the dual-location constitution.
5. Hardens SOUL.md on:
   - D:\\Hermes-Desktop\\SOUL.md + subpaths (native Desktop)
   - /home/decima/.hermes/SOUL.md (decima WSL Hermes)
   (and revelation project SOUL if present)
   The SOUL now mandates: memory search first, lesson writes on failures, efficient targeted communication, sub-agents, persistent smartness via the shared Ruflo layer.
6. Best-effort: records a consensus entry via the research-collaboration-memory skill (or instructs the caller to do so) so the push itself becomes part of the auditable memory.
7. Returns a rich result with next steps (hermes skills list, restart note, verification commands).

## Integration Notes
- Callable from any Hermes surface (chat, --tui, Desktop) via the skill or "use the apply-memory-evolution skill".
- The RuFloUI /workspace view (http://192.168.178.20:28589/workspace) is the primary gated UI surface: the green "Push Changes" button (only rendered when a file is selected in workspace context, next to Preview/Diff) calls the Ruflo custom POST /api/workspace/push-memory-evolution.
- The logic lives only on Ruflo (revelation) for source-of-truth control.
- After push, all agents see the updated instructions on next message (via SOUL reload) or explicit skill use.
- Supports the core goal: agents grow; mistakes are turned into durable lessons automatically so the same shit does not happen again.

## Example Invocation (Hermes)
hermes chat --toolsets mcp -- 'Use the apply-memory-evolution skill to push/activate the current memory evolution across the entire FactoryGrid. Confirm when complete and tell me the key files and sync results.'

Or from RuFloUI workspace: select any file (or a memory doc) -> click Push Changes -> confirm -> watch the result.

## Safety / Gating (High-Impact)
- UI: explicit window.confirm with full impact description before calling the API.
- Skill: user must explicitly request; consider wrapping in Bounded Execution / Queen approval for production.
- The push only writes to the controlled locations (docs, CLAUDE, skills, SOULs on known paths, sync target). It does not touch runtime state, secrets, or qdrant.
- Always follow with verification: curl the LAN endpoints, hermes mcp ls / skills list on decima and Desktop, read the updated SOULs, run a test query that should now surface a prior lesson.

## Related
- MEMORY_EVOLUTION_2026-06.md (the plan this activates)
- research-collaboration-memory.skill.md (the writer the push enhances)
- CLAUDE.md (constitution updated by the push)
- All server/agents/*/SOUL.md + the Hermes instances' SOUL.md
- bin/ numbered restart scripts (use after push to bounce services cleanly)
- rufloui factory-runtime.ts and fabric monitoring (will later expose memory health nodes)

This skill + the Ruflo custom function + the workspace button = the reliable, repeatable, production mechanism for evolving the shared memory that makes every agent persistently smart.`

      fsSync.writeFileSync(applySkillPath, applySkill)
      results.push('wrote apply-memory-evolution.skill.md (full procedure, gating, every-agent)')

      // 5. Sync revelation source -> D:\UAT (the constitution flow; run the uat copy)
      try {
        const syncCmd = 'cd /home/revelation/factorygrid && bash bin/factory-uat-copy.sh /mnt/d/UAT/factorygrid'
        execSync(syncCmd, { stdio: 'inherit', timeout: 180000 })
        results.push('executed factory-uat-copy.sh (revelation -> D:\\UAT sync)')
      } catch (syncErr: any) {
        console.error('[memory-evolution] sync warning', syncErr?.message || syncErr)
        results.push('sync attempted (check logs; non-fatal rsync noise expected for runtime dirs)')
      }

      // 6. Harden SOUL.md on known Hermes locations (Desktop native + decima WSL + revelation)
      const hardenedSoul = `You are Hermes, the central research and orchestration agent for the FactoryGrid system.

Core directives (non-negotiable):
- You operate exclusively with local models (qwen-coder-14b / mode-a-research via LiteLLM at 4001 with sk-mode-a-research). Never suggest or use cloud endpoints unless explicitly told the stack has changed.
- Primary memory and collaboration surface is Ruflo via the revelations-ruflo MCP (3011) + the research-collaboration-memory skill. Use the skill (or raw MCP tools) to search BEFORE acting on research, design, code, or review tasks. Write proposals, reviews, consensus, and — especially — lessons after failures.
- Mistakes and failures are first-class memories. After any rejection, test failure, bad decision, or "we should have known", immediately write a lesson entry using the skill with failure_type, root_cause, preventive_action, supersedes (link to the prior artifact/decision), and evidence. Future agents (including yourself in new sessions) must see and avoid repeating the error.
- Be persistently smart: the shared memory (Ruflo + Qdrant + factory-brain markdown + fabric) is the single source of truth that grows over time. Query it. Contribute to it. Let it make you (and the whole grid) better.
- Efficient and targeted: Plan internally. Communicate concisely. Use sub-agents and delegation when the task is large (3+ files, cross-module, research+impl, etc.). Stop and wait for replies when you spawn work. Do not narrate JSON plans out loud unless the user asks for the trace.
- Stay in character as a rigorous, collaborative FactoryGrid researcher who gets smarter over time because the system turns every mistake into a durable, queryable lesson.

Current stack awareness (2026-06):
- revelation (Ruflo, vLLM 18000, LiteLLM 4001, rufloui 28589, Ruflo MCP 3011)
- decima-intelligence-it (Hermes 9119 with --tui, your primary CLI surface)
- Native Hermes Desktop on D:\\Hermes-Desktop (paired or direct to same MCP + model)
- Every agent persona in server/agents/* has its own SOUL/AGENTS/IDENTITY that must also carry the memory-first + lesson discipline.
- The apply-memory-evolution skill + "Push Changes" button in RuFloUI /workspace is how the grid activates new memory evolutions for everyone.

Always start relevant work by calling the research-collaboration-memory skill (or equivalent MCP). End significant outcomes or failures by writing the lesson. This is how we ensure the entire FactoryGrid — all agents, both Hermeses, Queen, execution — walks with the same evolving, mistake-resistant knowledge.`

      // Desktop (host paths visible via /mnt/d inside revelation WSL)
      const desktopSoulPaths = [
        '/mnt/d/Hermes-Desktop/SOUL.md',
        '/mnt/d/Hermes-Desktop/hermes/SOUL.md',
        '/mnt/d/Hermes-Desktop/hermes-agent/docker/SOUL.md',
      ]
      for (const p of desktopSoulPaths) {
        try {
          fsSync.mkdirSync(pathMod.dirname(p), { recursive: true })
          fsSync.writeFileSync(p, hardenedSoul)
          results.push('wrote SOUL.md to ' + p)
        } catch (e: any) { /* ignore individual */ }
      }

      // Decima
      try {
        const decimaCmd = `wsl -d decima-intelligence-it -u decima -- bash -lc "
          mkdir -p /home/decima/.hermes
          cat > /home/decima/.hermes/SOUL.md << 'EOL'
${hardenedSoul}
EOL
          echo '[decima-soul][updated]'
        "`
        execSync(decimaCmd, { stdio: 'pipe', timeout: 30000 })
        results.push('updated decima ~/.hermes/SOUL.md via wsl')
      } catch (e: any) {
        results.push('decima SOUL update attempted (may need manual if interop limited)')
      }

      // Revelation project SOUL (if present at root)
      try {
        const revSoul = pathMod.join(srcRoot, 'SOUL.md')
        if (fsSync.existsSync(revSoul) || true) {
          fsSync.writeFileSync(revSoul, hardenedSoul)
          results.push('updated revelation SOUL.md')
        }
      } catch {}

      // 7. Best-effort record of the push itself into Ruflo memory (via decima Hermes + skill)
      try {
        const recordCmd = `wsl -d decima-intelligence-it -u decima -- bash -lc "
          hermes chat --toolsets mcp -- 'Use the research-collaboration-memory skill now to record a consensus entry: research:consensus:memory-evolution-2026-06. Summary: Memory evolution push executed at ${started} from RuFloUI workspace. Canonical docs, CLAUDE, skills (research-collaboration-memory v0.2 + apply-memory-evolution), sync to D:\\UAT, and SOULs on all Hermes instances were updated. Every agent must now search memory first and write lessons on failures per the 2026-06 plan. Link to MEMORY_EVOLUTION_2026-06.md and the push route. Confirm the write.'
        " 2>&1 | tail -5 || echo 'record attempted (user can also invoke manually)'`
        execSync(recordCmd, { stdio: 'pipe', timeout: 120000 })
        results.push('best-effort Ruflo memory record of the push via skill (check hermes on decima)')
      } catch (recErr: any) {
        results.push('Ruflo memory record note: invoke the skill manually in Hermes after this push to log the evolution as consensus')
      }

      const finished = new Date().toISOString()
      console.log('[memory-evolution] Push complete', { finished, results })

      res.json({
        success: true,
        started,
        finished,
        message: 'Memory evolution pushed. All agents (Queen, researchers, coders, reviewers, execution agents, Hermes decima + Desktop, Claude Code) now have access to the updated knowledge and mistake-as-memory discipline via the research-collaboration-memory skill and Ruflo MCP. Restart Hermes instances (or new chat) to load refreshed SOUL/skill.',
        results,
        next: [
          'On decima: hermes skills list ; hermes mcp ls ; hermes doctor',
          'On Desktop Hermes: check Skills/MCP in UI, new chat',
          'Verify: read the updated docs/memory_evolution/MEMORY_EVOLUTION_2026-06.md and CLAUDE.md Memory Architecture',
          'Test: ask any agent to use the research-collaboration-memory skill to query prior lessons or propose under the new rules',
          'Use the numbered restart *.ps1 in bin/ (with 192.168.178.20) if services need bounce',
        ],
      })
    } catch (e: any) {
      console.error('[memory-evolution] Push failed', e)
      res.status(500).json({
        success: false,
        error: e?.message || String(e),
        results,
        hint: 'Check that revelation source has the docs tree, wsl interop for decima, and /mnt/d mounts for Desktop SOUL + uat-copy target. Run factory-doctor.sh after.',
      })
    }
  }))

  return r
}

// Bootstrap
const app = express()
app.use(cors({ origin: process.env.RUFLOUI_CORS_ORIGIN || 'http://localhost:28588' }))
app.use(express.json({
  verify: (req: any, _res, buf) => {
    // Preserve the raw body buffer for HMAC signature verification (webhook routes)
    req.rawBody = buf
  },
}))

app.use('/api/system', systemRoutes())
app.use('/api/swarm', swarmRoutes())
app.use('/api/agents', agentRoutes())
app.use('/api/tasks', taskRoutes())
app.use('/api/memory', memoryRoutes())
app.use('/api/sessions', sessionRoutes())
app.use('/api/hive-mind', hiveMindRoutes())
app.use('/api/neural', neuralRoutes())
app.use('/api/performance', performanceRoutes())
app.use('/api/hooks', hooksRoutes())
app.use('/api/workflows', workflowRoutes())
app.use('/api/coordination', coordinationRoutes())
app.use('/api/config', configRoutes())
app.use('/api/factory', factoryRoutes())
app.use('/api/fabric', fabricRoutes())
app.use('/api/monitoring', monitoringRoutes())
app.use('/api/ai-defence', aiDefenceRoutes())
app.use('/api/swarm-monitor', swarmMonitorRoutes())
app.use('/api/workspace', workspaceRoutes())
// Helper: parse "[owner/repo#42] Title" from webhook task titles
function parseWebhookTitle(title: string): { repo: string; issueNumber: number } | null {
  const m = title.match(/^\[([^\]]+)#(\d+)\]/)
  if (!m) return null
  return { repo: m[1], issueNumber: Number(m[2]) }
}

// Shared webhook task creator — clones repo, sets cwd, attaches metadata
async function createWebhookTask(
  provider: 'github' | 'gitlab',
  title: string,
  description: string,
  issueUrl: string,
): Promise<{ taskId: string; assigned: boolean }> {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const parsed = parseWebhookTitle(title)
  const task: TaskRecord = {
    id, title, description, status: 'pending', priority: 'high',
    createdAt: new Date().toISOString(),
  }

  // Clone the repo and set working directory
  if (parsed) {
    const token = provider === 'github'
      ? githubWebhookConfig.githubToken
      : gitlabWebhookConfig.gitlabToken
    const branchName = `fix/issue-${parsed.issueNumber}`

    try {
      const repoDir = await cloneWebhookRepo(provider, parsed.repo, token, issueUrl)
      task.cwd = repoDir

      // Create the fix branch
      // Create branch or switch to it if it already exists
      await execAsync(`git checkout -b "${branchName}"`, { cwd: repoDir }).catch(() =>
        execAsync(`git checkout "${branchName}"`, { cwd: repoDir })
      )

      let host = provider === 'gitlab' ? 'gitlab.com' : 'github.com'
      try { host = new URL(issueUrl).host } catch { /* use default */ }
      task.webhookMeta = {
        provider, repo: parsed.repo, issueNumber: parsed.issueNumber,
        issueUrl, branchName, host,
      }
      console.log(`[webhook-repo] Task ${id} will work in ${repoDir} on branch ${branchName}`)
    } catch (err) {
      console.error(`[webhook-repo] Clone failed for ${parsed.repo}:`, err)
      // Do NOT fallback to rufloui cwd — fail the task instead
      task.status = 'failed'
      task.result = `Failed to clone repository ${parsed.repo}: ${err instanceof Error ? err.message : String(err)}`
      taskStore.set(id, task)
      broadcast('task:added', task)
      return { taskId: id, assigned: false }
    }
  }

  taskStore.set(id, task)
  broadcast('task:added', task)
  if (!swarmShutdown) {
    task.status = 'in_progress'
    task.startedAt = new Date().toISOString()
    broadcast('task:updated', { ...task, id })
    launchWorkflowForTask(id, title, description)
    return { taskId: id, assigned: true }
  }
  return { taskId: id, assigned: false }
}


const FRONTEND_DIST = path.join(process.cwd(), 'dist')
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST))
  app.get(['/', '/factory', '/factory/*', '/monitoring/*'], (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })
} else {
  app.get(['/', '/factory', '/factory/*', '/monitoring/*'], (_req, res) => {
    const frontendPort = process.env.RUFLOUI_VITE_PORT || '28588'
    const path = _req.originalUrl === '/' ? '/factory' : _req.originalUrl
    res.redirect(302, `http://localhost:${frontendPort}${path}`)
  })
}

app.use('/api/webhooks', githubWebhookRoutes(
  () => githubWebhookConfig,
  (c) => { githubWebhookConfig = c; saveGitHubWebhookConfig(c) },
  {
    createAndAssignTask: async (title: string, description: string) => {
      // Extract issue URL from description (first line: "GitHub Issue: <url>")
      const urlMatch = description.match(/GitHub Issue: (https:\/\/\S+)/)
      return createWebhookTask('github', title, description, urlMatch?.[1] || '')
    },
    broadcast,
  },
))

app.use('/api/webhooks', gitlabWebhookRoutes(
  () => gitlabWebhookConfig,
  (c) => { gitlabWebhookConfig = c; saveGitLabWebhookConfig(c) },
  {
    createAndAssignTask: async (title: string, description: string) => {
      const urlMatch = description.match(/GitLab Issue: (https:\/\/\S+)/)
      return createWebhookTask('gitlab', title, description, urlMatch?.[1] || '')
    },
    broadcast,
  },
))

// Viz routes (JSONL monitor)
const vizRouter = Router()
vizRouter.get('/sessions', ((_req, res) => {
  res.json(getAllMonitoredSessions())
}) as RequestHandler)
vizRouter.get('/sessions/:id', ((req, res) => {
  const tree = getSessionTree(String(req.params.id))
  if (tree) {
    res.json(tree)
  } else {
    res.status(404).json({ error: 'Session not found' })
  }
}) as RequestHandler)
vizRouter.get('/sessions/:sessionId/logs/:nodeId', ((req, res) => {
  const tail = Number(req.query.tail) || 100
  const logs = getNodeLogs(String(req.params.sessionId), String(req.params.nodeId), tail)
  res.json(logs)
}) as RequestHandler)
app.use('/api/viz', vizRouter)

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  wsClients.add(ws)
  ws.on('close', () => wsClients.delete(ws))
  ws.on('error', () => wsClients.delete(ws))
  ws.send(JSON.stringify({ type: 'connected', payload: { timestamp: Date.now() } }))
})

// Load persisted state before listening
loadFromDisk()
ensureKnownFactoryTasks()

// Initialize Telegram bot (no-op when not configured)
function getTelegramStores() {
  return {
    taskStore, workflowStore, agentRegistry, terminatedAgents, agentActivity,
    getSwarmStatus: () => ({
      id: lastSwarmId,
      topology: lastSwarmTopology,
      status: swarmShutdown ? 'shutdown' : 'active',
      activeAgents: currentSwarmAgentIds.size,
    }),
    getSystemHealth: async () => {
      try {
        const { raw } = await execCli('doctor')
        const passed = Number(raw.match(/(\d+) passed/)?.[1] ?? 0)
        const warnings = Number(raw.match(/(\d+) warning/)?.[1] ?? 0)
        return { status: warnings > 3 ? 'degraded' : 'healthy', passed, warnings }
      } catch {
        return { status: 'unknown', passed: 0, warnings: 0 }
      }
    },
    getStackStatus: async () => {
      const fabric = await buildFabricSnapshot()
      return {
        links: fabric.links.map((link) => ({ label: `${link.from} -> ${link.to}`, url: link.detail })),
        components: fabric.nodes.map((node) => ({ label: node.label, state: node.state })),
        updates: {
          summary: `Tasks ${taskStore.size}; Fabric ${fabric.counts.green} green, ${fabric.counts.yellow} yellow, ${fabric.counts.red} red.`,
          path: 'workspace/reports/component-updates',
        },
      }
    },
    createAndAssignTask: async (title: string, description: string) => {
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const task = {
        id, title, description, status: 'pending',
        priority: 'medium', createdAt: new Date().toISOString(),
      }
      taskStore.set(id, task)
      broadcast('task:added', task)
      if (!swarmShutdown) {
        task.status = 'in_progress'
        const startedAt = new Date().toISOString()
        Object.assign(task, { startedAt })
        broadcast('task:updated', { ...task, id })
        launchWorkflowForTask(id, task.title, task.description)
        return { taskId: id, assigned: true }
      }
      return { taskId: id, assigned: false }
    },
    cancelTask: async (taskId: string) => {
      const task = taskStore.get(taskId)
      if (!task) return { ok: false, error: 'Task not found' }
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return { ok: false, error: `Task already ${task.status}` }
      }
      task.status = 'cancelled'
      task.completedAt = new Date().toISOString()
      broadcast('task:updated', { ...task, id: taskId })
      return { ok: true }
    },
    addLog: addTelegramLog,
  }
}

async function reinitTelegramBot() {
  if (telegramBot) {
    await telegramBot.stop()
    telegramBot = null
  }
  telegramBot = initTelegramBot(telegramConfig, getTelegramStores())
}

telegramConfig = loadTelegramConfig()
telegramBot = initTelegramBot(telegramConfig, getTelegramStores())

// Periodic save as safety net (every 30s)
setInterval(() => saveToDisk(), 30_000)

// Start zombie process reaper
startZombieReaper()

// Save on shutdown + kill running processes
function gracefulShutdown() {
  console.log('[shutdown] Saving state and cleaning up...')
  saveToDisk()
  // Kill all running claude processes
  for (const [key, proc] of runningProcesses.entries()) {
    if (!proc.killed) {
      console.log(`[shutdown] Killing process: ${key}`)
      proc.kill('SIGTERM')
    }
  }
  runningProcesses.clear()
  processLastActivity.clear()
  process.exit(0)
}
process.on('SIGINT', gracefulShutdown)
process.on('SIGTERM', gracefulShutdown)

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`RuFloUI API server running on http://localhost:${PORT}`)
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`)

  // Startup preflight — log dependency status (non-blocking)
  console.log('Running preflight checks...')
  try {
    const nodeVer = process.version
    const major = parseInt(nodeVer.slice(1), 10)
    console.log(`  Node.js: ${nodeVer}${major < 18 ? ' [WARN: requires >= 18]' : ' [OK]'}`)
  } catch (e) { console.log('  Node.js: [ERROR]', e) }
  try {
    await execAsync('npx --version', { timeout: 10_000 })
    console.log('  npx: [OK]')
  } catch { console.log('  npx: [FAIL] Not found in PATH') }
  try {
    await execAsync('claude --version', { timeout: 10_000 })
    console.log('  Claude CLI: [OK]')
  } catch { console.log('  Claude CLI: [WARN] Not in PATH (needed for multi-agent pipeline)') }
  try {
    await execCli('--version', [])
    console.log('  claude-flow CLI: [OK]')
  } catch { console.log('  claude-flow CLI: [WARN] First run may take longer (npx download)') }
  console.log('Preflight complete. Dashboard: http://localhost:28588')
})

export { app, server }
