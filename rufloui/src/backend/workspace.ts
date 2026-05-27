import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.turbo', '.cache', '.ruflo', '.swarm',
])

function gitEnv(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: root,
  }
}

async function resolveWorkspaceRoot(root: string): Promise<string> {
  const candidates = [
    root,
    process.env.FACTORYGRID_ROOT,
    '/factorygrid',
    process.cwd(),
  ].filter((candidate): candidate is string => Boolean(candidate && fsSync.existsSync(candidate)))

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd: resolved,
        env: gitEnv(resolved),
      })
      return stdout.trim() || resolved
    } catch {
      // Try the next mounted workspace candidate.
    }
  }

  return path.resolve(root)
}

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

export interface WorkspaceFile {
  path: string
  realPath: string
  content: string
  size: number
  language: string
  truncated: boolean
}

export async function listWorkspaceTree(root: string, limit = 800): Promise<WorkspaceTree> {
  const resolvedRoot = await resolveWorkspaceRoot(root)
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
  const resolvedRoot = await resolveWorkspaceRoot(root)
  let stdout = ''
  try {
    const result = await execFileAsync('git', ['status', '--porcelain=v1'], {
      cwd: resolvedRoot,
      env: gitEnv(resolvedRoot),
    })
    stdout = result.stdout
  } catch (err) {
    return {
      root: resolvedRoot,
      files: [{
        path: err instanceof Error ? err.message : String(err),
        status: 'unknown',
      }],
    }
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
  const resolvedRoot = await resolveWorkspaceRoot(root)
  const safePath = filePath ? sanitizeRelativePath(filePath) : undefined
  const args = ['diff', '--']
  if (safePath) args.push(safePath)
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: resolvedRoot,
      env: gitEnv(resolvedRoot),
      maxBuffer: 2 * 1024 * 1024,
    })
    return { path: safePath ?? '', diff: stdout }
  } catch {
    return { path: safePath ?? '', diff: '' }
  }
}

export async function getWorkspaceFile(root: string, filePath: string): Promise<WorkspaceFile> {
  const resolvedRoot = await resolveWorkspaceRoot(root)
  const safePath = sanitizeRelativePath(filePath)
  const realPath = path.join(resolvedRoot, safePath)
  const relative = path.relative(resolvedRoot, realPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path must be relative to the workspace')
  }
  const stat = await fs.stat(realPath)
  if (!stat.isFile()) throw new Error('Path is not a file')
  const maxBytes = 512 * 1024
  const handle = await fs.open(realPath, 'r')
  try {
    const size = Math.min(stat.size, maxBytes)
    const buffer = Buffer.alloc(size)
    await handle.read(buffer, 0, size, 0)
    return {
      path: safePath,
      realPath,
      content: buffer.toString('utf-8'),
      size: stat.size,
      language: languageForPath(safePath),
      truncated: stat.size > maxBytes,
    }
  } finally {
    await handle.close()
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

function languageForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json' || ext === '.jsonl') return 'json'
  if (ext === '.md') return 'markdown'
  if (ext === '.ts' || ext === '.tsx') return 'typescript'
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs') return 'javascript'
  if (ext === '.yml' || ext === '.yaml') return 'yaml'
  if (ext === '.py') return 'python'
  if (ext === '.sh') return 'shell'
  if (ext === '.ps1') return 'powershell'
  return 'text'
}
