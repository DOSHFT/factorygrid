import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { FabricContainer, FabricSnapshot } from '@/types'

const tone = {
  production: '#22c55e',
  legacy: '#f59e0b',
  support: '#38bdf8',
}

function ContainerRow({ container }: { container: FabricContainer }) {
  const nameColor = container.kind === 'legacy' ? tone.legacy : 'var(--text-primary)'
  const status = container.status.toLowerCase().startsWith('up') ? 'running' : 'stopped'
  return (
    <div style={s.containerRow(container.kind)}>
      <div style={s.containerHeader}>
        <div>
          <div style={{ ...s.containerName, color: nameColor }}>{container.name}</div>
          <div style={s.image}>{container.image || 'unknown image'}</div>
        </div>
        <div style={s.badges}>
          <span style={s.kindBadge(container.kind)}>{container.kind}</span>
          {container.memoryRelated && <span style={s.memoryBadge}>memory</span>}
          <StatusBadge status={status} size="sm" />
        </div>
      </div>
      <div style={s.role}>{container.role}</div>
      <div style={s.metaGrid}>
        <div><span style={s.metaLabel}>Status</span>{container.status}</div>
        <div><span style={s.metaLabel}>Ports</span>{container.ports || 'none'}</div>
      </div>
    </div>
  )
}

export default function FabricPanel() {
  const [snapshot, setSnapshot] = useState<FabricSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setSnapshot(await api.monitoring.fabric())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 15000)
    return () => clearInterval(timer)
  }, [refresh])

  const groups = useMemo(() => {
    const containers = snapshot?.containers ?? []
    return {
      production: containers.filter(c => c.kind === 'production'),
      legacy: containers.filter(c => c.kind === 'legacy'),
      support: containers.filter(c => c.kind === 'support'),
    }
  }, [snapshot])

  const task = snapshot?.tasks.componentUpdateTask

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>FactoryGrid Fabric</div>
          <div style={s.subtitle}>
            {snapshot ? `Production local stack, updated ${new Date(snapshot.generatedAt).toLocaleString()}` : 'Loading production fabric state'}
          </div>
        </div>
        <Button onClick={refresh} loading={loading}>Refresh</Button>
      </div>

      {error && <Card><div style={s.error}>{error}</div></Card>}

      <div style={s.stats}>
        <Card><div style={s.stat}><strong>{snapshot?.memory.visibleEntries ?? '--'}</strong><span>visible memories</span></div></Card>
        <Card><div style={s.stat}><strong>{snapshot?.tasks.completed ?? '--'}/{snapshot?.tasks.total ?? '--'}</strong><span>tasks complete</span></div></Card>
        <Card><div style={s.stat}><strong>{groups.production.length}</strong><span>production containers</span></div></Card>
        <Card><div style={s.stat}><strong>{groups.legacy.length}</strong><span>legacy containers</span></div></Card>
      </div>

      <Card title="Production Memory Path">
        <div style={s.cardBody}>
          <div style={s.pathList}>
            {(snapshot?.memory.productionPath ?? []).map(item => <span key={item} style={s.pathItem}>{item}</span>)}
          </div>
          <div style={s.note}>
            Graphiti active: {snapshot?.memory.graphitiActive ? 'yes' : 'no'}; Neo4j shadow and Qdrant remain the production checked path.
          </div>
        </div>
      </Card>

      <Card title="Component Update Task">
        <div style={s.cardBody}>
          {task ? (
            <>
              <div style={s.taskLine}>
                <span style={s.taskId}>{task.id}</span>
                <StatusBadge status={task.status} />
              </div>
              <div style={s.role}>{task.title}</div>
              <pre style={s.result}>{task.result || 'No result recorded'}</pre>
            </>
          ) : (
            <div style={s.note}>task-update-20260526 is not present in the task store.</div>
          )}
        </div>
      </Card>

      <Card title={`Production Containers (${groups.production.length})`}>
        <div style={s.list}>{groups.production.map(c => <ContainerRow key={c.name} container={c} />)}</div>
      </Card>

      <Card title={`Legacy / Old Containers (${groups.legacy.length})`}>
        <div style={s.cardBody}>
          <div style={s.legacyHint}>Orange names are not production-authoritative. Old memory-related Docker VMs/containers stay visible here instead of being silently mixed into the live memory path.</div>
          <div style={s.list}>{groups.legacy.map(c => <ContainerRow key={c.name} container={c} />)}</div>
        </div>
      </Card>

      {groups.support.length > 0 && (
        <Card title={`Support Containers (${groups.support.length})`}>
          <div style={s.list}>{groups.support.map(c => <ContainerRow key={c.name} container={c} />)}</div>
        </Card>
      )}
    </div>
  )
}

const s: Record<string, any> = {
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 },
  stat: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 },
  cardBody: { padding: '16px 20px' },
  pathList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pathItem: { border: '1px solid var(--border)', background: 'var(--bg-primary)', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)' },
  note: { marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' },
  legacyHint: { marginBottom: 12, fontSize: 13, color: tone.legacy },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, padding: '16px 20px' },
  containerRow: (kind: string) => ({ border: `1px solid ${kind === 'legacy' ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`, background: 'var(--bg-primary)', borderRadius: 8, padding: 14, minWidth: 0 }),
  containerHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  containerName: { fontSize: 15, fontWeight: 700, wordBreak: 'break-word' },
  image: { fontSize: 11, color: 'var(--text-muted)', marginTop: 3, wordBreak: 'break-all' },
  badges: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  kindBadge: (kind: 'production' | 'legacy' | 'support') => ({ color: tone[kind], border: `1px solid ${tone[kind]}66`, background: `${tone[kind]}1f`, borderRadius: 6, padding: '3px 7px', fontSize: 11, fontWeight: 700 }),
  memoryBadge: { color: '#c084fc', border: '1px solid rgba(192,132,252,0.45)', background: 'rgba(192,132,252,0.12)', borderRadius: 6, padding: '3px 7px', fontSize: 11, fontWeight: 700 },
  role: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.45 },
  metaGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: 6, marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' },
  metaLabel: { display: 'inline-block', color: 'var(--text-muted)', width: 52 },
  taskLine: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  taskId: { fontFamily: 'monospace', color: 'var(--text-primary)' },
  result: { marginTop: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, color: 'var(--text-secondary)', fontSize: 12 },
  error: { padding: 16, color: 'var(--accent-red)' },
}
