import { useEffect, useState } from 'react'
import { Brain, ClipboardCheck, FileText, Search, Send } from 'lucide-react'
import { api, FactoryWorkflowGuide, SpecKitIntakeResult } from '@/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/store'

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  width: '100%',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 6,
}

export default function FactoryPanel() {
  const { addLog } = useStore()
  const [guide, setGuide] = useState<FactoryWorkflowGuide | null>(null)
  const [title, setTitle] = useState('')
  const [vision, setVision] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')
  const [cautions, setCautions] = useState('')
  const [requestedMode, setRequestedMode] = useState<'PLAN' | 'DEV' | 'UAT' | 'PROD'>('PLAN')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SpecKitIntakeResult | null>(null)
  const [brainQuery, setBrainQuery] = useState('')
  const [brainResults, setBrainResults] = useState<Array<{ id: string; title: string; compiledTruth: string; path: string }>>([])

  useEffect(() => {
    api.factory.guide()
      .then(setGuide)
      .catch((err) => addLog({ level: 'error', message: `Factory guide failed: ${(err as Error).message}`, source: 'factory' }))
  }, [addLog])

  const fillTemplate = () => {
    if (!guide) return
    setVision(guide.promptTemplate)
  }

  const submit = async () => {
    setSubmitting(true)
    try {
      const created = await api.factory.createIntake({ title, vision, successCriteria, cautions, requestedMode })
      setResult(created)
      addLog({ level: 'info', message: `Factory intake created: ${created.runId}`, source: 'factory' })
    } catch (err) {
      addLog({ level: 'error', message: `Factory intake failed: ${(err as Error).message}`, source: 'factory' })
    } finally {
      setSubmitting(false)
    }
  }

  const searchBrain = async () => {
    const data = await api.factory.searchBrain(brainQuery)
    setBrainResults(data.results)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 0.9fr) minmax(420px, 1.1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Factory Intake" actions={<Button size="sm" variant="secondary" onClick={fillTemplate}>Use Template</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short build request name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Factory Mode</label>
              <select value={requestedMode} onChange={(e) => setRequestedMode(e.target.value as typeof requestedMode)} style={inputStyle}>
                <option value="PLAN">PLAN - read-only spec and research</option>
                <option value="DEV">DEV - YOLO execution inside Docker boundary</option>
                <option value="UAT">UAT - gate host, network, env, Docker impact</option>
                <option value="PROD">PROD - standard approval gates</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Prompt / Vision</label>
              <textarea value={vision} onChange={(e) => setVision(e.target.value)} rows={12} placeholder="Describe the product, change, or research target." style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Success Criteria</label>
              <textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} rows={4} placeholder="What must be true before this is considered shipped?" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div>
              <label style={labelStyle}>Cautions</label>
              <textarea value={cautions} onChange={(e) => setCautions(e.target.value)} rows={4} placeholder="Protected files, network impact, credentials, repo boundaries, anything dangerous." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <Button loading={submitting} disabled={!title.trim() || !vision.trim()} onClick={submit}><Send size={14} /> Create Spec Intake</Button>
          </div>
        </Card>

        {result && (
          <Card title="Created Artifacts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><strong>Run:</strong> <span style={{ fontFamily: 'monospace' }}>{result.runId}</span></div>
              {[result.requestPath, result.specPath, result.checklistPath, result.brainPath].map((item) => (
                <div key={item} style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{item}</div>
              ))}
              <div style={{ color: 'var(--accent-yellow)', marginTop: 4 }}>{result.nextGate}</div>
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Workflow" actions={<ClipboardCheck size={16} color="var(--accent-green)" />}>
          <div style={{ display: 'grid', gap: 8 }}>
            {(guide?.phases || []).map((phase) => (
              <div key={phase.phase} style={{ display: 'grid', gridTemplateColumns: '120px 150px 1fr', gap: 10, alignItems: 'start', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{phase.phase}</div>
                <div style={{ color: 'var(--accent-blue)', fontSize: 12 }}>{phase.owner}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}><span style={{ fontFamily: 'monospace' }}>{phase.writes}</span><br />Gate: {phase.gate}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Factory Brain" actions={<Brain size={16} color="var(--accent-purple)" />}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={brainQuery} onChange={(e) => setBrainQuery(e.target.value)} placeholder="Search compiled truth and timelines" style={inputStyle} />
            <Button variant="secondary" onClick={searchBrain}><Search size={14} /> Search</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brainResults.map((item) => (
              <div key={item.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 600 }}><FileText size={14} /> {item.title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}>{item.compiledTruth || 'No compiled truth extracted.'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace', marginTop: 6 }}>{item.path}</div>
              </div>
            ))}
            {!brainResults.length && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Create an intake or search existing brain pages.</div>}
          </div>
        </Card>

        <Card title="Prompt Cautions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(guide?.cautions || []).map((item) => <div key={item} style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{item}</div>)}
          </div>
        </Card>
      </div>
    </div>
  )
}
