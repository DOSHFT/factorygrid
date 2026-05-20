import { useEffect, useMemo, useState } from 'react'
import { FileText, Folder, GitCompare, RefreshCw } from 'lucide-react'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { WorkspaceStatusFile, WorkspaceTree } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  created: 'var(--accent-green)',
  modified: 'var(--accent-yellow)',
  deleted: 'var(--accent-red)',
  renamed: 'var(--accent-blue)',
  untracked: 'var(--accent-green)',
  unknown: 'var(--text-muted)',
}

export default function WorkspacePanel() {
  const [tree, setTree] = useState<WorkspaceTree | null>(null)
  const [statusFiles, setStatusFiles] = useState<WorkspaceStatusFile[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(true)

  const statusByPath = useMemo(() => {
    const map = new Map<string, WorkspaceStatusFile>()
    for (const file of statusFiles) map.set(file.path, file)
    return map
  }, [statusFiles])

  const refresh = async () => {
    setLoading(true)
    try {
      const [treeRes, statusRes] = await Promise.all([api.workspace.tree(1200), api.workspace.status()])
      setTree(treeRes)
      setStatusFiles(statusRes.files)
      if (!selectedPath && statusRes.files[0]) setSelectedPath(statusRes.files[0].path)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!selectedPath) {
      setDiff('')
      return
    }
    api.workspace.diff(selectedPath)
      .then((res) => setDiff(res.diff || 'No diff for selected file.'))
      .catch((err) => setDiff(String(err)))
  }, [selectedPath])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        <Card title="Workspace" actions={<Button size="sm" variant="secondary" onClick={refresh} loading={loading}><RefreshCw size={14} /> Refresh</Button>}>
          <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {tree?.root || '/workspace'}
          </div>
          <div style={{ height: 'calc(100vh - 300px)', minHeight: 360, overflow: 'auto', padding: '0 8px 12px' }}>
            {tree?.nodes.map((node) => {
              const status = statusByPath.get(node.path)
              const isSelected = selectedPath === node.path
              const depth = node.path.split('/').length - 1
              return (
                <button
                  key={node.path}
                  onClick={() => node.type === 'file' && setSelectedPath(node.path)}
                  disabled={node.type !== 'file'}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', paddingLeft: 8 + depth * 14,
                    background: isSelected ? 'var(--bg-hover)' : 'transparent',
                    border: 'none', borderRadius: 'var(--radius)', color: 'var(--text-secondary)',
                    cursor: node.type === 'file' ? 'pointer' : 'default', textAlign: 'left', fontSize: 12,
                  }}
                >
                  {node.type === 'directory' ? <Folder size={14} color="var(--accent-blue)" /> : <FileText size={14} color="var(--text-muted)" />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                  {status && <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[status.status] }} title={status.status} />}
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, minHeight: 0 }}>
        <Card title={`Git Changes (${statusFiles.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 16px' }}>
            {statusFiles.length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No git changes detected.</span>
            ) : statusFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedPath(file.path)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px',
                  border: `1px solid ${selectedPath === file.path ? STATUS_COLORS[file.status] : 'var(--border)'}`,
                  borderRadius: 'var(--radius)', background: selectedPath === file.path ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                  color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', maxWidth: 360,
                }}
              >
                <GitCompare size={13} color={STATUS_COLORS[file.status]} />
                <span style={{ color: STATUS_COLORS[file.status], textTransform: 'uppercase', fontSize: 10, fontWeight: 700 }}>{file.status}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title={selectedPath ? `Diff: ${selectedPath}` : 'Diff'}>
          <pre style={{
            margin: 0, padding: 16, height: 'calc(100vh - 360px)', minHeight: 360, overflow: 'auto',
            background: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 12,
            lineHeight: 1.55, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{selectedPath ? diff : 'Select a changed file to view its diff.'}</pre>
        </Card>
      </div>
    </div>
  )
}
