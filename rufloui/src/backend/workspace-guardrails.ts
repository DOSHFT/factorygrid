import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { classifyProtectedPath } from './factory-runtime'

export interface AgentWriteDecision {
  allowed: boolean
  requestedPath: string
  rel?: string
  abs?: string
  reason: string
  hitlRequired: boolean
  protected: boolean
  allowedPrefixes: string[]
}

export interface GuardrailSnapshot {
  id: string
  dir: string
  reportPath: string
  diffPath: string
  head: string
  status: string
  rollbackInstructions: string[]
}

function gitEnv(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: root,
  }
}

function gitOutput(root: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: root,
      env: gitEnv(root),
      encoding: 'utf-8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }).trim()
  } catch {
    return ''
  }
}

export function agentAllowedWritePrefixes(): string[] {
  const configured = process.env.FACTORY_AGENT_ALLOWED_WRITE_PREFIXES
  const prefixes = (configured || 'workspace/')
    .split(',')
    .map((item) => item.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .map((item) => item.endsWith('/') ? item : `${item}/`)
  return prefixes.length ? prefixes : ['workspace/']
}

export function normalizeFactoryWritePath(root: string, requestedPath: string): { rel: string; abs: string } | null {
  const normalized = requestedPath.replace(/\\/g, '/').replace(/[.,;:]+$/, '')
  if (normalized.split('/').includes('..')) return null
  let rel = ''
  if (normalized.startsWith('/factorygrid/')) {
    rel = normalized.slice('/factorygrid/'.length)
  } else if (normalized.startsWith('workspace/')) {
    rel = normalized
  } else {
    return null
  }
  const rootResolved = path.resolve(root)
  const abs = path.resolve(rootResolved, rel)
  const relative = path.relative(rootResolved, abs)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  return { rel: relative.replace(/\\/g, '/'), abs }
}

export function evaluateAgentWriteRequest(root: string, requestedPath: string): AgentWriteDecision {
  const allowedPrefixes = agentAllowedWritePrefixes()
  const target = normalizeFactoryWritePath(root, requestedPath)
  if (!target) {
    return {
      allowed: false,
      requestedPath,
      reason: 'Path must resolve under the FactoryGrid workspace and use a workspace/ or /factorygrid/workspace/ path.',
      hitlRequired: false,
      protected: false,
      allowedPrefixes,
    }
  }
  const protectedPath = classifyProtectedPath(target.rel)
  if (protectedPath) {
    return {
      allowed: false,
      requestedPath,
      rel: target.rel,
      abs: target.abs,
      reason: 'Protected configuration or dependency path requires explicit human approval before autonomous writes.',
      hitlRequired: true,
      protected: true,
      allowedPrefixes,
    }
  }
  const allowed = allowedPrefixes.some((prefix) => target.rel === prefix.slice(0, -1) || target.rel.startsWith(prefix))
  return {
    allowed,
    requestedPath,
    rel: target.rel,
    abs: target.abs,
    reason: allowed ? 'Path is inside the autonomous write allowlist.' : `Path is outside allowed prefixes: ${allowedPrefixes.join(', ')}`,
    hitlRequired: !allowed,
    protected: false,
    allowedPrefixes,
  }
}

export function createWorkspaceGuardrailSnapshot(root: string, taskId: string, targetRel: string, reason: string): GuardrailSnapshot {
  const safeTaskId = taskId.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80)
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const id = `${stamp}-${safeTaskId}`
  const dir = path.join(root, 'workspace', 'guardrails', 'snapshots', id)
  fs.mkdirSync(dir, { recursive: true })

  const head = gitOutput(root, ['rev-parse', '--short=12', 'HEAD']) || 'no-git-head'
  const status = gitOutput(root, ['status', '--porcelain=v1'])
  const diff = gitOutput(root, ['diff', '--binary'])
  const diffPath = path.join(dir, 'pre-run.diff')
  const reportPath = path.join(dir, 'snapshot.md')
  fs.writeFileSync(diffPath, diff ? `${diff}\n` : '', 'utf-8')

  const rollbackInstructions = [
    `Review pre-run status: ${path.relative(root, reportPath).replace(/\\/g, '/')}`,
    diff ? `Restore pre-run tracked changes: git apply -R ${path.relative(root, diffPath).replace(/\\/g, '/')}` : 'No pre-run tracked diff was present.',
    `Inspect target diff: git diff -- ${targetRel}`,
    `Rollback target from HEAD if tracked: git restore -- ${targetRel}`,
    `Remove target manually if it was newly created and should not remain: ${targetRel}`,
  ]

  fs.writeFileSync(reportPath, [
    '# Agent Workspace Guardrail Snapshot',
    '',
    `Snapshot ID: ${id}`,
    `Created: ${new Date().toISOString()}`,
    `Task ID: ${taskId}`,
    `Reason: ${reason}`,
    `Target: ${targetRel}`,
    `HEAD: ${head}`,
    '',
    '## Pre-Run Git Status',
    '```text',
    status || 'clean',
    '```',
    '',
    '## Rollback Instructions',
    ...rollbackInstructions.map((item) => `- ${item}`),
    '',
  ].join('\n'), 'utf-8')

  return { id, dir, reportPath, diffPath, head, status, rollbackInstructions }
}
