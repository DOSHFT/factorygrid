import fs from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', '.ruflo', '.swarm',
])

export interface WorkspaceTreeNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt: string
}

export interface WorkspaceTree {
  root: string
  nodes: WorkspaceTreeNode[]
}

export interface WorkspaceStatusFile {
  path: string
  status: 'created' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'unknown'
}

export interface WorkspaceStatus {
  root: string
  files: WorkspaceStatusFile[]
}

export interface WorkspaceDiff {
  path: string
  diff: string
}

export async function listWorkspaceTree(root: string, limit = 800): Promise<WorkspaceTree> {
  const resolvedRoot = path.resolve(root)
  const nodes: WorkspaceTreeNode[] = []

  async function walk(dir: string) {
    if (nodes.length >= limit) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (nodes.length >= limit) break
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      const rel = path.relative(resolvedRoot, abs).replace(/\\/g, '/')
      const stat = await fs.stat(abs)
      nodes.push({
        path: rel,
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isDirectory() ? undefined : stat.size,
        modifiedAt: stat.mtime.toISOString(),
      })
      if (entry.isDirectory()) await walk(abs)
    }
  }

  await walk(resolvedRoot)
  nodes.sort((a, b) => a.path.localeCompare(b.path))
  return { root: resolvedRoot, nodes }
}

export async function getWorkspaceStatus(root: string): Promise<WorkspaceStatus> {
  const resolvedRoot = path.resolve(root)
  let stdout = ''
  try {
    const result = await execFileAsync('git', ['status', '--porcelain=v1'], { cwd: resolvedRoot })
    stdout = result.stdout
  } catch {
    return { root: resolvedRoot, files: [] }
  }
  const files = stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLine)
    .sort((a, b) => a.path.localeCompare(b.path))
  return { root: resolvedRoot, files }
}

export async function getWorkspaceDiff(root: string, filePath?: string): Promise<WorkspaceDiff> {
  const resolvedRoot = path.resolve(root)
  const safePath = filePath ? sanitizeRelativePath(filePath) : undefined
  const args = ['diff', '--']
  if (safePath) args.push(safePath)
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: resolvedRoot, maxBuffer: 2 * 1024 * 1024 })
    return { path: safePath ?? '', diff: stdout }
  } catch {
    return { path: safePath ?? '', diff: '' }
  }
}

function parseStatusLine(line: string): WorkspaceStatusFile {
  const code = line.slice(0, 2)
  const rawPath = line.slice(3)
  const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1)! : rawPath
  const compact = code.trim()
  let status: WorkspaceStatusFile['status'] = 'unknown'
  if (compact === '??') status = 'created'
  else if (compact.includes('A')) status = 'created'
  else if (compact.includes('M')) status = 'modified'
  else if (compact.includes('D')) status = 'deleted'
  else if (compact.includes('R')) status = 'renamed'
  else if (compact) status = 'modified'
  return { path: filePath, status }
}

export function sanitizeRelativePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error('Path must be relative to the workspace')
  }
  return normalized
}
