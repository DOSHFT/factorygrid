import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, RotateCcw, ShieldCheck, ClipboardList, Cpu, Play, Square, SearchCode } from 'lucide-react'
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
  urls?: Array<{ label: string; url: string }>
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

function FabricGraph({ snapshot }: { snapshot: FabricSnapshot | null }) {
  const nodes = snapshot?.nodes || []
  const links = snapshot?.links || []
  const production = nodes.filter((node) => node.kind === 'Production Docker')
  const runtime = links.map((link) => ({
    id: link.id,
    label: link.to,
    state: link.state,
    detail: link.detail,
    kind: 'Runtime endpoint',
  }))
  const width = 980
  const height = 390
  const center = { x: 490, y: 64 }
  const prodY = 200
  const endpointY = 330
  const prodGap = production.length > 1 ? 760 / (production.length - 1) : 0
  const endpointGap = runtime.length > 1 ? 560 / (runtime.length - 1) : 0
  const graphNodes = [
    { id: 'operator', label: 'RuFloUI', state: 'green' as State, kind: 'Operator API', detail: 'Fabric monitor source', x: center.x, y: center.y },
    ...production.map((node, index) => ({ ...node, x: 110 + (prodGap * index), y: prodY })),
    ...runtime.map((node, index) => ({ ...node, x: 210 + (endpointGap * index), y: endpointY })),
  ]
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]))
  const graphLinks = [
    ...production.map((node) => ({ from: 'operator', to: node.id, state: node.state, detail: node.detail })),
    ...links.map((link) => ({ from: 'operator', to: link.id, state: link.state, detail: link.detail })),
  ]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 820, width: '100%', height: 390, display: 'block', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {graphLinks.map((link) => {
          const from = nodeById.get(link.from)
          const to = nodeById.get(link.to)
          if (!from || !to) return null
          return (
            <g key={`${link.from}-${link.to}`}>
              <line x1={from.x} y1={from.y + 26} x2={to.x} y2={to.y - 30} stroke={colors[link.state]} strokeWidth="2" strokeDasharray={link.state === 'green' ? '0' : '7 6'} opacity="0.82" />
              <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="4" fill={colors[link.state]} />
            </g>
          )
        })}
        {graphNodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={node.id === 'operator' ? 43 : 37} fill="var(--bg-secondary)" stroke={colors[node.state]} strokeWidth="2.5" />
            <text x={node.x} y={node.y - 4} textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="700">{node.label.length > 16 ? `${node.label.slice(0, 15)}...` : node.label}</text>
            <text x={node.x} y={node.y + 13} textAnchor="middle" fill="var(--text-muted)" fontSize="10">{node.kind.length > 20 ? node.kind.slice(0, 20) : node.kind}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export default function FabricMonitorPanel() {
  const [snapshot, setSnapshot] = useState<FabricSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [vllmModels, setVllmModels] = useState<Array<{ id: string; profile?: string; model?: string; path: string; source: string; safeSettings?: Record<string, unknown> }>>([])
  const [currentModel, setCurrentModel] = useState('')
  const [requestedModel, setRequestedModel] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [lastRca, setLastRca] = useState<{ path: string; summary: string } | null>(null)
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
  const degraded = useMemo(() => {
    const nodeItems = (snapshot?.nodes || [])
      .filter((node) => node.state !== 'green')
      .map((node) => ({ id: `node-${node.id}`, label: node.label, type: node.kind, state: node.state, detail: node.detail, restartTarget: node.restartable ? node.id : '', isVllm: false }))
    const runtimeTargets: Record<string, string> = {
      'LiteLLM': 'factory_litellm',
      'OpenHands': 'agent_openhands',
      'RuFlo orchestrator': 'factory_ruflo',
    }
    const linkItems = (snapshot?.links || [])
      .filter((link) => link.state !== 'green')
      .map((link) => ({ id: `link-${link.id}`, label: `${link.from} -> ${link.to}`, type: 'Runtime connection', state: link.state, detail: link.detail, restartTarget: runtimeTargets[link.to] || '', isVllm: link.to === 'vLLM' }))
    return [...nodeItems, ...linkItems]
  }, [snapshot])
  const selectedModelMeta = useMemo(() => vllmModels.find((model) => model.id === selectedModel), [selectedModel, vllmModels])
  const selectedSafeSettings = selectedModelMeta?.safeSettings || null
  const selectedPolicy = String(selectedSafeSettings?.policy || 'allowed')

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

  async function restartTarget(target: string, label: string) {
    if (!target) return
    setBusy(target)
    try {
      await api.fabric.restart({ target, type: 'docker-compose-service' })
      addLog({ level: 'warn', source: 'fabric', message: `Restart requested for ${label}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `Restart failed for ${label}: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function changeVllmModel() {
    if (!selectedModel.trim()) return
    setBusy('vllm-model')
    try {
      const result = await api.fabric.startVllm(selectedModel.trim())
      addLog({ level: result.blocked ? 'error' : 'warn', source: 'fabric', message: result.blocked ? `vLLM start blocked for ${selectedModel}: ${String(result.safeSettings?.reason || 'unsafe profile')}` : `vLLM start requested for ${result.model}. PID ${result.pid || 'unknown'}${result.hermesWorkOrder ? ` | Hermes sync: ${result.hermesWorkOrder}` : ''}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM start failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function reloadVllmModel() {
    if (!selectedModel.trim()) return
    setBusy('vllm-reload')
    try {
      const result = await api.fabric.restartVllm(selectedModel.trim())
      addLog({ level: result.blocked ? 'error' : 'warn', source: 'fabric', message: result.blocked ? `vLLM reload blocked for ${selectedModel}: ${String(result.safeSettings?.reason || 'unsafe profile')}` : `vLLM reload requested for ${result.model}. PID ${result.pid || 'unknown'}${result.hermesWorkOrder ? ` | Hermes sync: ${result.hermesWorkOrder}` : ''}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM reload failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function warmupVllmModel() {
    if (!selectedModel.trim()) return
    setBusy('vllm-warmup')
    try {
      const result = await api.fabric.warmupVllm(selectedModel.trim())
      setLastRca({ path: result.path, summary: result.summary })
      addLog({ level: result.ok ? 'info' : 'error', source: 'fabric', message: `vLLM warm-up: ${result.summary}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM warm-up failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function stopVllm() {
    setBusy('vllm-stop')
    try {
      await api.fabric.stopVllm()
      addLog({ level: 'warn', source: 'fabric', message: 'vLLM stop requested' })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM stop failed: ${(err as Error).message}` })
    } finally {
      setBusy(null)
    }
  }

  async function runVllmRca() {
    setBusy('vllm-rca')
    try {
      const result = await api.fabric.runVllmRca()
      setLastRca({ path: result.path, summary: result.summary })
      addLog({ level: 'warn', source: 'fabric', message: `vLLM RCA written: ${result.path}` })
      await load()
    } catch (err) {
      addLog({ level: 'error', source: 'fabric', message: `vLLM RCA failed: ${(err as Error).message}` })
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

      <Card title="Live Fabric Topology">
        <FabricGraph snapshot={snapshot} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
          {(snapshot?.links || []).map((link) => <LinkLine key={link.id} link={link} />)}
        </div>
      </Card>

      <Card title="Degraded States">
        {degraded.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No degraded states detected. All production containers and runtime connections are green.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {degraded.map((item) => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StateDot state={item.state} />
                    <span style={{ color: colors[item.state], fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>{item.state}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 650 }}>{item.label}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{item.type}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6, wordBreak: 'break-word' }}>{item.detail}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {item.restartTarget && (
                    <Button size="sm" variant="secondary" onClick={() => restartTarget(item.restartTarget, item.label)} loading={busy === item.restartTarget}>
                      <RotateCcw size={13} /> Restart
                    </Button>
                  )}
                  {item.isVllm && (
                    <>
                      <Button size="sm" variant="secondary" onClick={changeVllmModel} loading={busy === 'vllm-model'}><Play size={13} /> Start Model</Button>
                      <Button size="sm" variant="secondary" onClick={warmupVllmModel} loading={busy === 'vllm-warmup'}><Cpu size={13} /> Warm Up</Button>
                      <Button size="sm" variant="secondary" onClick={reloadVllmModel} loading={busy === 'vllm-reload'}><RotateCcw size={13} /> Reload</Button>
                      <Button size="sm" variant="secondary" onClick={runVllmRca} loading={busy === 'vllm-rca'}><SearchCode size={13} /> Get Reason</Button>
                    </>
                  )}
                  {!item.restartTarget && !item.isVllm && (
                    <Button size="sm" variant="secondary" onClick={createWorkOrder} loading={busy === 'work-order'}><ClipboardList size={13} /> Work Order</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {node.restartable && (
                      <Button size="sm" variant="secondary" onClick={() => restart(node)} loading={busy === node.id}>
                        <RotateCcw size={13} /> Restart
                      </Button>
                    )}
                    {node.urls?.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', fontSize: 12, textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px' }}>
                          {link.label}
                        </a>
                    ))}
                  </div>
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
              {vllmModels.map((model) => <option key={model.id} value={model.id}>{model.profile || model.id}{model.model && model.model !== model.id ? ` -> ${model.model}` : ''}</option>)}
            </select>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8, wordBreak: 'break-word' }}>
              Loaded: {currentModel || 'unknown'} | Requested: {requestedModel || 'unknown'}
            </div>
            {selectedSafeSettings && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 8, wordBreak: 'break-word' }}>
                Safe launch: {selectedPolicy.toUpperCase()} | GPU {String(selectedSafeSettings.gpuMem || 'auto')} | context {String(selectedSafeSettings.maxModelLen || 'auto')} | seqs {String(selectedSafeSettings.maxNumSeqs || 'auto')} | batched {String(selectedSafeSettings.maxBatchedTokens || 'auto')} | swap {String(selectedSafeSettings.swapSpaceGb || 'auto')}GB | quantization {String(selectedSafeSettings.quantization || 'auto')} | {String(selectedSafeSettings.reason || '')}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={changeVllmModel} loading={busy === 'vllm-model'} disabled={selectedPolicy === 'blocked'}><Play size={14} /> Start Model</Button>
            <Button variant="secondary" onClick={warmupVllmModel} loading={busy === 'vllm-warmup'}><Cpu size={14} /> Warm Up Model</Button>
            <Button variant="secondary" onClick={reloadVllmModel} loading={busy === 'vllm-reload'} disabled={selectedPolicy === 'blocked'}><RotateCcw size={14} /> Reload Model</Button>
            <Button variant="secondary" onClick={stopVllm} loading={busy === 'vllm-stop'}><Square size={14} /> Stop</Button>
            <Button variant="secondary" onClick={runVllmRca} loading={busy === 'vllm-rca'}><SearchCode size={14} /> Run RCA</Button>
          </div>
        </div>
        {lastRca && (
          <div style={{ marginTop: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: 12, wordBreak: 'break-word' }}>
            RCA: {lastRca.summary} | {lastRca.path}
          </div>
        )}
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
