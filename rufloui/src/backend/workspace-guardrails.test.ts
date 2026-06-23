import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createWorkspaceGuardrailSnapshot, evaluateAgentWriteRequest, normalizeFactoryWritePath } from './workspace-guardrails'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rufloui-guardrails-'))
  fs.mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true })
})

afterEach(() => {
  delete process.env.FACTORY_AGENT_ALLOWED_WRITE_PREFIXES
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('workspace guardrails', () => {
  test('normalizes factory workspace paths without escaping root', () => {
    expect(normalizeFactoryWritePath(tmpDir, '/factorygrid/workspace/out.txt')?.rel).toBe('workspace/out.txt')
    expect(normalizeFactoryWritePath(tmpDir, 'workspace/out.txt')?.rel).toBe('workspace/out.txt')
    expect(normalizeFactoryWritePath(tmpDir, '/tmp/out.txt')).toBeNull()
    expect(normalizeFactoryWritePath(tmpDir, 'workspace/../docker-compose.yml')).toBeNull()
  })

  test('allows configured workspace prefixes and refuses paths outside the allowlist', () => {
    process.env.FACTORY_AGENT_ALLOWED_WRITE_PREFIXES = 'workspace/spec-kit,workspace/reports'

    const allowed = evaluateAgentWriteRequest(tmpDir, 'workspace/spec-kit/intake/demo.md')
    const denied = evaluateAgentWriteRequest(tmpDir, 'workspace/tmp/demo.md')

    expect(allowed.allowed).toBe(true)
    expect(allowed.hitlRequired).toBe(false)
    expect(denied.allowed).toBe(false)
    expect(denied.hitlRequired).toBe(true)
    expect(denied.reason).toContain('outside allowed prefixes')
  })

  test('requires human approval for protected config paths', () => {
    const decision = evaluateAgentWriteRequest(tmpDir, '/factorygrid/docker-compose.yml')

    expect(decision.allowed).toBe(false)
    expect(decision.protected).toBe(true)
    expect(decision.hitlRequired).toBe(true)
  })

  test('creates a pre-run snapshot with rollback instructions', () => {
    execSync('git init', { cwd: tmpDir })
    execSync('git config user.email test@example.com', { cwd: tmpDir })
    execSync('git config user.name Tester', { cwd: tmpDir })
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# demo\n')
    execSync('git add README.md', { cwd: tmpDir })
    execSync('git commit -m init', { cwd: tmpDir })
    fs.appendFileSync(path.join(tmpDir, 'README.md'), 'changed\n')

    const snapshot = createWorkspaceGuardrailSnapshot(tmpDir, 'task-123', 'workspace/out.txt', 'test write')

    expect(fs.existsSync(snapshot.reportPath)).toBe(true)
    expect(fs.existsSync(snapshot.diffPath)).toBe(true)
    expect(fs.readFileSync(snapshot.reportPath, 'utf-8')).toContain('Rollback Instructions')
    expect(fs.readFileSync(snapshot.diffPath, 'utf-8')).toContain('+changed')
  })
})
