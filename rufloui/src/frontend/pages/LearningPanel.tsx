import { useEffect, useState } from 'react'
import { Brain, Database, RefreshCw, TrendingUp } from 'lucide-react'
import { api } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

type Progress = Awaited<ReturnType<typeof api.factory.agentGrowthProgress>>

const metricStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  padding: 14,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-primary)',
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={metricStyle}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function bar(score: number) {
  return (
    <div style={{ height: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: score >= 80 ? 'var(--accent-green)' : score >= 55 ? 'var(--accent-blue)' : 'var(--accent-yellow)' }} />
    </div>
  )
}

export default function LearningPanel() {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setProgress(await api.factory.agentGrowthProgress()) } finally { setLoading(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      await api.factory.runAgentGrowth()
      setTimeout(load, 1500)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Learning Progress" actions={<div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" onClick={load} loading={loading}><RefreshCw size={14} /> Refresh</Button><Button size="sm" onClick={runNow} loading={running}><Brain size={14} /> Run Growth</Button></div>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 12 }}>
          <Metric label="Evolution Score" value={`${progress?.score ?? 0}%`} />
          <Metric label="Agents Seeded" value={progress?.totalAgents ?? 0} />
          <Metric label="Sources Watched" value={progress?.totalSources ?? 0} />
          <Metric label="Brain Pages" value={progress?.totalBrainPages ?? 0} />
          <Metric label="Qdrant Points" value={progress?.qdrantPoints ?? 0} />
        </div>
        <div style={{ marginTop: 14 }}>{bar(progress?.score ?? 0)}</div>
        <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
          Latest run: {progress?.latestRunAt ? new Date(progress.latestRunAt).toLocaleString() : 'none'} {progress?.latestRunLog ? `(${progress.latestRunLog})` : ''}
        </div>
      </Card>

      <Card title="Agent Intelligence Evolution" actions={<TrendingUp size={16} color="var(--accent-green)" />}>
        <div style={{ display: 'grid', gap: 8 }}>
          {(progress?.agents || []).map((agent) => (
            <div key={agent.agent} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 90px 90px 190px', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{agent.agent}</div>
              {bar(agent.score)}
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{agent.score}%</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{agent.sources} sources</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{agent.seedFiles} seeds</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{agent.lastUpdated ? new Date(agent.lastUpdated).toLocaleString() : 'never'}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="What This Means" actions={<Database size={16} color="var(--accent-blue)" />}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
          Progress is computed from agent watchlists, seed artifacts, Factory Brain pages, and Qdrant indexed memory. It tracks whether the agents have new learning material and whether that material was promoted into durable memory. It does not claim model weights changed.
        </div>
      </Card>
    </div>
  )
}
