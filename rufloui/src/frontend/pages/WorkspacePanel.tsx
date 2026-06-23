import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, FileText, Folder, GitCompare, RefreshCw, UploadCloud } from 'lucide-react'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { WorkspaceFile, WorkspaceStatusFile, WorkspaceTree, WorkspaceTreeNode } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  created: 'var(--accent-green)',
  modified: 'var(--accent-yellow)',
  deleted: 'var(--accent-red)',
  renamed: 'var(--accent-blue)',
  untracked: 'var(--accent-green)',
  unknown: 'var(--text-muted)',
}

interface TreeItem extends WorkspaceTreeNode {
  children: TreeItem[]
}

type ViewMode = 'preview' | 'diff'

function buildTree(nodes: WorkspaceTreeNode[]): TreeItem[] {
  const byPath = new Map<string, TreeItem>()
  const roots: TreeItem[] = []

  function ensureDir(path: string): TreeItem {
    const existing = byPath.get(path)
    if (existing) return existing
    const parts = path.split('/')
    const node: TreeItem = {
      path,
      name: parts.at(-1) || path,
      type: 'directory',
      modifiedAt: new Date(0).toISOString(),
      children: [],
    }
    byPath.set(path, node)
    const parentPath = parts.slice(0, -1).join('/')
    if (parentPath) ensureDir(parentPath).children.push(node)
    else roots.push(node)
    return node
  }

  for (const raw of nodes) {
    const parts = raw.path.split('/')
    const parentPath = parts.slice(0, -1).join('/')
    const node: TreeItem = { ...raw, children: [] }
    byPath.set(raw.path, node)
    if (parentPath) ensureDir(parentPath).children.push(node)
    else roots.push(node)
  }

  const seen = new Set<string>()
  function dedupeAndSort(items: TreeItem[]): TreeItem[] {
    const clean = items.filter((item) => {
      if (seen.has(item.path)) return false
      seen.add(item.path)
      item.children = dedupeAndSort(item.children)
      return true
    })
    return clean.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return dedupeAndSort(roots)
}

function defaultExpanded(nodes: WorkspaceTreeNode[]): Set<string> {
  const desired = new Set([
    'factory-brain',
    'factory-brain/pages',
    'factory-brain/pages/agents',
    'reports',
    'reports/component-updates',
    'research',
    'research/agent-growth',
  ])
  return new Set(nodes.filter((node) => node.type === 'directory' && desired.has(node.path)).map((node) => node.path))
}

function formatPreview(file: WorkspaceFile | null): string {
  if (!file) return 'Select a file from the workspace tree.'
  if (file.language === 'json') {
    try {
      if (file.realPath.endsWith('.jsonl')) return file.content
      return JSON.stringify(JSON.parse(file.content), null, 2)
    } catch {
      return file.content
    }
  }
  return file.content
}

export default function WorkspacePanel() {
  const [tree, setTree] = useState<WorkspaceTree | null>(null)
  const [statusFiles, setStatusFiles] = useState<WorkspaceStatusFile[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null)
  const [diff, setDiff] = useState('')
  const [mode, setMode] = useState<ViewMode>('preview')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [markedForPush, setMarkedForPush] = useState<Set<string>>(new Set())
  const [pushMessage, setPushMessage] = useState('')
  const [pushStatus, setPushStatus] = useState('')
  const [pushing, setPushing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(false)

  const statusByPath = useMemo(() => {
    const map = new Map<string, WorkspaceStatusFile>()
    for (const file of statusFiles) map.set(file.path, file)
    return map
  }, [statusFiles])

  const roots = useMemo(() => buildTree(tree?.nodes ?? []), [tree])
  const selectedPushFiles = useMemo(() => statusFiles.filter((file) => markedForPush.has(file.path)), [markedForPush, statusFiles])

  const refresh = async () => {
    setLoading(true)
    try {
      const [treeRes, statusRes] = await Promise.all([api.workspace.tree(2000), api.workspace.status()])
      setTree(treeRes)
      setStatusFiles(statusRes.files)
      setMarkedForPush((current) => {
        const changed = new Set(statusRes.files.map((file) => file.path))
        if (current.size) return new Set([...current].filter((file) => changed.has(file)))
        return new Set(statusRes.files.filter((file) => file.status === 'modified' || file.status === 'deleted').map((file) => file.path))
      })
      setExpanded((current) => current.size ? current : defaultExpanded(treeRes.nodes))
      if (!selectedPath && statusRes.files[0]) {
        setSelectedPath(statusRes.files[0].path)
        setMode('diff')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!selectedPath) {
      setSelectedFile(null)
      setDiff('')
      return
    }
    setContentLoading(true)
    Promise.all([
      api.workspace.file(selectedPath).catch((err) => ({ path: selectedPath, realPath: selectedPath, content: String(err), size: 0, language: 'text', truncated: false })),
      api.workspace.diff(selectedPath).catch((err) => ({ path: selectedPath, diff: String(err) })),
    ]).then(([fileRes, diffRes]) => {
      setSelectedFile(fileRes)
      setDiff(diffRes.diff || 'No diff for selected file.')
    }).finally(() => setContentLoading(false))
  }, [selectedPath])

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectFile = (path: string, nextMode: ViewMode = 'preview') => {
    setSelectedPath(path)
    setMode(nextMode)
  }

  const toggleMarkedForPush = (path: string) => {
    setMarkedForPush((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const markModifiedDeleted = () => {
    setMarkedForPush(new Set(statusFiles.filter((file) => file.status === 'modified' || file.status === 'deleted').map((file) => file.path)))
  }

  const pushSelected = async () => {
    if (selectedPushFiles.length === 0) {
      setPushStatus('Select at least one modified/deleted/created file to push.')
      return
    }
    setPushing(true)
    setPushStatus('')
    try {
      const result = await api.workspace.pushSelected(selectedPushFiles.map((file) => file.path), pushMessage.trim() || undefined)
      setPushStatus(`Pushed ${result.commit} to ${result.branch}: ${result.files.join(', ')}`)
      setPushMessage('')
      setMarkedForPush(new Set())
      await refresh()
    } catch (err) {
      setPushStatus((err as Error).message)
    } finally {
      setPushing(false)
    }
  }

  const renderNode = (node: TreeItem, depth = 0) => {
    const status = statusByPath.get(node.path)
    const isSelected = selectedPath === node.path
    const isOpen = expanded.has(node.path)
    const isDirectory = node.type === 'directory'

    return (
      <div key={node.path}>
        <button
          onClick={() => isDirectory ? toggleFolder(node.path) : selectFile(node.path)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 8px', paddingLeft: 8 + depth * 14,
            background: isSelected ? 'var(--bg-hover)' : 'transparent',
            border: 'none', borderRadius: 'var(--radius)', color: isDirectory ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer', textAlign: 'left', fontSize: 12,
          }}
        >
          {isDirectory ? (
            isOpen ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />
          ) : <span style={{ width: 13 }} />}
          {isDirectory ? <Folder size={14} color="var(--accent-blue)" /> : <FileText size={14} color="var(--text-muted)" />}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          {status && <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[status.status] }} title={status.status} />}
        </button>
        {isDirectory && isOpen && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const selectedTitle = selectedPath ? `${mode === 'preview' ? 'Preview' : 'Diff'}: ${selectedPath}` : 'Preview'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        <Card title="Workspace" actions={<Button size="sm" variant="secondary" onClick={refresh} loading={loading}><RefreshCw size={14} /> Refresh</Button>}>
          <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {tree?.root || '/workspace'}
          </div>
          <div style={{ height: 'calc(100vh - 300px)', minHeight: 360, overflow: 'auto', padding: '0 8px 12px' }}>
            {roots.map((node) => renderNode(node))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, minHeight: 0 }}>
        <Card
          title={`Git Changes (${statusFiles.length})`}
          actions={statusFiles.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={markModifiedDeleted}>Mark modified/deleted</Button>
              <Button size="sm" onClick={pushSelected} loading={pushing} disabled={selectedPushFiles.length === 0}>
                <UploadCloud size={14} /> Commit & Push selected
              </Button>
            </div>
          )}
        >
          <div style={{ display: 'grid', gap: 10, padding: '0 16px 16px' }}>
            {statusFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={pushMessage}
                  onChange={(event) => setPushMessage(event.target.value)}
                  placeholder="Commit message (optional)"
                  style={inputStyle}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{selectedPushFiles.length} marked</span>
              </div>
            )}
            {pushStatus && <div style={{ color: pushStatus.startsWith('Pushed ') ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 12 }}>{pushStatus}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {statusFiles.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No git changes detected.</span>
            ) : statusFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => selectFile(file.path, 'diff')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px',
                  border: `1px solid ${selectedPath === file.path ? STATUS_COLORS[file.status] : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', background: selectedPath === file.path ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', maxWidth: 360,
                }}
              >
                <input
                  type="checkbox"
                  checked={markedForPush.has(file.path)}
                  onChange={(event) => {
                    event.stopPropagation()
                    toggleMarkedForPush(file.path)
                  }}
                  onClick={(event) => event.stopPropagation()}
                  title="Mark for commit and push"
                />
                <GitCompare size={13} color={STATUS_COLORS[file.status]} />
                <span style={{ color: STATUS_COLORS[file.status], textTransform: 'uppercase', fontSize: 10, fontWeight: 700 }}>{file.status}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
              </button>
            ))}
            </div>
          </div>
        </Card>

        <Card
          title={selectedTitle}
          actions={selectedPath && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: 2 }}>
              <button onClick={() => setMode('preview')} style={toggleStyle(mode === 'preview')}><Eye size={13} /> Preview</button>
              <button onClick={() => setMode('diff')} style={toggleStyle(mode === 'diff')}><GitCompare size={13} /> Diff</button>
            </div>
          )}
        >
          <pre style={{
            margin: 0, padding: 16, height: 'calc(100vh - 360px)', minHeight: 360, overflow: 'auto',
            background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12,
            lineHeight: 1.55, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {contentLoading ? 'Loading file...' : selectedPath ? (mode === 'preview' ? formatPreview(selectedFile) : diff) : 'Select a file to preview it.'}
            {mode === 'preview' && selectedFile?.truncated ? '\n\n[Preview truncated at 512 KB]' : ''}
          </pre>
        </Card>
      </div>
    </div>
  )
}

const inputStyle = {
  minWidth: 280,
  flex: '1 1 320px',
  height: 30,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  padding: '0 10px',
  fontSize: 12,
}

function toggleStyle(active: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 9px',
    border: 'none',
    borderRadius: 'var(--radius)',
    background: active ? 'var(--accent-blue)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
  }
}
