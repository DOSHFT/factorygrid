import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, RotateCcw, ShieldCheck, ClipboardList, Cpu } from 'lucide-react'
import { api } from '@/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useStore } from '@/store'

type State = 'green' | 'yellow' | 'red'

interface FabricNode {
  id: string
  label: string
  kind: string
  state: State
  detail: string
  restartable: boolean
  restartType?: string
}

interface FabricLink {
  id: string
  from: string
  to: string
  state: State
  detail: string
}

interface FabricSnapshot {
  generatedAt: string
  counts: Record<State, number>
  nodes: FabricNode[]
  links: FabricLink[]
}

const colors: Record<State, string> = {
  green: 'var(--accent-green)',
  yellow: 'var(--accent-yellow)',
  red: 'var(--accent-red)',
}

function StateDot({ state }: { state: State }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: colors[state], boxShadow: `0 0 14px ${colors[state]}`, flexShrink: 0 }} />
}

function LinkLine({ link }: { link: FabricLink }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 12 }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'right', wordBreak: 'break-word' }}>{link.from}</span>
      <div title={link.detail} style={{ height: 4, borderRadius: 4, background: colors[link.state], boxShadow: `0 0 14px ${colors[link.state]}` }} />
      <span style={{ color: 'var(--text-secondary)', fontSize: 12, wordBreak: 'break-word' }}>{link.to}</span>
    </div>
  )
}

export default function FabricMonitorPanel() {
  const [snapshot, setSnapshot] = useState<FabricSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [vllmModels, setVllmModels] = useState<Array<{ id: string; path: string; source: string }>>([])
  const [currentModel, setCurrentModel] = useState('')
  const [requestedModel, setRequestedModel] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const addLog = useStore((s) => s.addLog)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSnapshot(await api.fabric.snapshot())
      const modelData = await api.fabric.vllmModels().catch(() => null)
      if (modelData) {
        setVllmModels(modelData.models)
        setCurrentModel(modelData.current)
        setRequestedModel(modelData.requested)
        setSelectedModel((prev) => prev || modelData.requested || modelData.current)
      }
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `Fabric snapshot failed: ${(err as Error).message}` })
    } finally {
      setLoading(false)
    }
  }, [addLog])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  const grouped = useMemo(() => {
    const groups = new Map<string, FabricNode[]>()
    for (const node of snapshot?.nodes || []) {
      groups.set(node.kind, [...(groups.get(node.kind) || []), node])
    }
    return [...groups.entries()]
  }, [snapshot])

  async function restart(node: FabricNode) {
    if (!node.restartType) return
    setBusy(node.id)
    try {
      await api.fabric.restart({ target: node.id, type: node.restartType })
      addLog({ level: 'warn', source: 'fabric', message: `Restart requested for ${node.label}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `Restart failed for ${node.label}: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function changeVllmModel() {
    if (!selectedModel.trim()) return
    setBusy('vllm-model')
    try {
      const result = await api.fabric.setVllmModel(selectedModel.trim())
      addLog({ level: 'warn', source: 'fabric', message: `vLLM model staged. Run on Revelation: ${result.command}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM model change failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function createWorkOrder() {
    setBusy('work-order')
    try {
      const result = await api.fabric.updateWorkOrder('manual')
      addLog({ level: 'warn', source: 'updates', message: `Update work-order created: ${result.path}` })
    } catch (err) {
      addLog({ level: 'error', source: 'updates', message: `Update work-order failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22 }}>Fabric Monitor</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            VM, service, model, and LAN path state. Lines show A to B reachability.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={createWorkOrder} loading={busy === 'work-order'}><ClipboardList size={14} /> Update Work Order</Button>
          <Button onClick={load} loading={loading}><RefreshCw size={14} /> Refresh</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {(['green', 'yellow', 'red'] as State[]).map((state) => (
          <Card key={state}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StateDot state={state} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors[state] }}>{snapshot?.counts[state] ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{state}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Connection Lines">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(snapshot?.links || []).map((link) => <LinkLine key={link.id} link={link} />)}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {grouped.map(([kind, nodes]) => (
          <Card key={kind} title={kind}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nodes.map((node) => (
                <div key={node.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StateDot state={node.state} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{node.label}</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 5, wordBreak: 'break-word' }}>{node.detail}</div>
                  </div>
                  {node.restartable && (
                    <Button size="sm" variant="secondary" onClick={() => restart(node)} loading={busy === node.id}>
                      <RotateCcw size={13} /> Restart
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card title="vLLM Model Control">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>
              <Cpu size={16} /> Local vLLM model
            </div>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
            >
              {vllmModels.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
            </select>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, wordBreak: 'break-word' }}>
              Loaded: {currentModel || 'unknown'} | Requested: {requestedModel || 'unknown'}
            </div>
          </div>
          <Button variant="secondary" onClick={changeVllmModel} loading={busy === 'vllm-model'}>Stage Model</Button>
        </div>
      </Card>

      <Card title="Supervisor Gate">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
          <ShieldCheck size={18} color="var(--accent-yellow)" />
          Component updates create a work-order only. Agents must research snapshot and rollback steps, then Queen must approve before implementation.
        </div>
      </Card>
    </div>
  )
}
