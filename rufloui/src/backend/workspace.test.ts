import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { getWorkspaceDiff, getWorkspaceStatus, listWorkspaceTree } from './workspace'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rufloui-workspace-'))
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(tmpDir, 'README.md'), '# demo\n')
  fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), 'export const value = 1\n')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('workspace helpers', () => {

  test('returns empty status outside a git repository', async () => {
    const status = await getWorkspaceStatus(tmpDir)
    const diff = await getWorkspaceDiff(tmpDir, 'README.md')

    expect(status.files).toEqual([])
    expect(diff.diff).toBe('')
  })
  test('lists files and directories while skipping heavy local state', async () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'ignored\n')

    const tree = await listWorkspaceTree(tmpDir)

    expect(tree.root).toBe(tmpDir)
    expect(tree.nodes.map((node) => node.path)).toEqual(['README.md', 'src', 'src/app.ts'])
  })

  test('reports git status and diff for modified and created files', async () => {
    await run('git init')
    await run('git config user.email test@example.com')
    await run('git config user.name Tester')
    await run('git add README.md src/app.ts')
    await run('git commit -m init')
    fs.appendFileSync(path.join(tmpDir, 'src', 'app.ts'), 'export const next = 2\n')
    fs.writeFileSync(path.join(tmpDir, 'src', 'new.ts'), 'export const created = true\n')

    const status = await getWorkspaceStatus(tmpDir)
    const diff = await getWorkspaceDiff(tmpDir, 'src/app.ts')

    expect(status.files).toEqual([
      { path: 'src/app.ts', status: 'modified' },
      { path: 'src/new.ts', status: 'created' },
    ])
    expect(diff.path).toBe('src/app.ts')
    expect(diff.diff).toContain('+export const next = 2')
  })

  test('returns an explanatory preview for untracked files', async () => {
    await run('git init')
    await run('git config user.email test@example.com')
    await run('git config user.name Tester')
    await run('git add README.md')
    await run('git commit -m init')
    fs.writeFileSync(path.join(tmpDir, 'src', 'new.ts'), 'export const created = true\n')

    const diff = await getWorkspaceDiff(tmpDir, 'src/new.ts')

    expect(diff.path).toBe('src/new.ts')
    expect(diff.diff).toContain('Created file: src/new.ts')
    expect(diff.diff).toContain('+export const created = true')
  })
})

function run(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: tmpDir }, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
