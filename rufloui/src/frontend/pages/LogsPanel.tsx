import { useState, useMemo, useCallback } from 'react'
import { useStore } from '@/store'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Virtuoso } from 'react-virtuoso'

const LEVEL_COLORS: Record<string, string> = {
  info: 'var(--accent-blue)',
  warn: 'var(--accent-yellow)',
  error: 'var(--accent-red)',
  debug: 'var(--text-muted)',
}

const LEVEL_BG: Record<string, string> = {
  info: 'rgba(59,130,246,0.15)',
  warn: 'rgba(234,179,8,0.15)',
  error: 'rgba(239,68,68,0.15)',
  debug: 'rgba(148,163,184,0.1)',
}

interface LogEntry {
  id: string
  timestamp: string
  level: string
  message: string
  source: string
}

export default function LogsPanel() {
  const { logs } = useStore()
  const [autoScroll, setAutoScroll] = useState(true)
  const [levelFilters, setLevelFilters] = useState<Record<string, boolean>>({
    info: true,
    warn: true,
    error: true,
    debug: true,
  })
  const [sourceFilter, setSourceFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  const toggleLevel = (level: string) => {
    setLevelFilters((prev) => ({ ...prev, [level]: !prev[level] }))
  }

  const filteredLogs = useMemo(() => {
    const srcLower = sourceFilter.toLowerCase()
    const searchLower = searchFilter.toLowerCase()
    return logs.filter((log) => {
      if (!levelFilters[log.level]) return false
      if (srcLower && !log.source.toLowerCase().includes(srcLower)) return false
      if (searchLower && !log.message.toLowerCase().includes(searchLower)) return false
      return true
    })
  }, [logs, levelFilters, sourceFilter, searchFilter])

  const handleClear = useCallback(() => {
    useStore.setState({ logs: [] })
  }, [])

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ruflo-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredLogs])

  const checkboxStyle = (level: string, active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 'var(--radius)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    userSelect: 'none',
    background: active ? LEVEL_BG[level] : 'transparent',
    color: active ? LEVEL_COLORS[level] : 'var(--text-muted)',
    border: `1px solid ${active ? LEVEL_COLORS[level] : 'var(--border)'}`,
    transition: 'all var(--transition)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Filters */}
      <Card>
        <div style={{ padding: '16px 24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {/* Level Filters */}
            <div style={{ display: 'flex', gap: 6 }}>
              {(['info', 'warn', 'error', 'debug'] as const).map((level) => (
                <span
                  key={level}
                  style={checkboxStyle(level, levelFilters[level])}
                  onClick={() => toggleLevel(level)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: levelFilters[level] ? LEVEL_COLORS[level] : 'var(--border)',
                    }}
                  />
                  {level.toUpperCase()}
                </span>
              ))}
            </div>

            {/* Source Filter */}
            <input
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '5px 10px',
                fontSize: 12,
                color: 'var(--text-primary)',
                width: 140,
                outline: 'none',
              }}
              placeholder="Filter source..."
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            />

            {/* Search Filter */}
            <input
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '5px 10px',
                fontSize: 12,
                color: 'var(--text-primary)',
                flex: 1,
                minWidth: 160,
                outline: 'none',
              }}
              placeholder="Search messages..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <Button
                size="sm"
                variant={autoScroll ? 'primary' : 'secondary'}
                onClick={() => setAutoScroll(!autoScroll)}
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExport}>Export</Button>
              <Button size="sm" variant="danger" onClick={handleClear}>Clear</Button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Showing {filteredLogs.length} of {logs.length} entries (max 500)
          </div>
        </div>
      </Card>

      {/* Log Stream */}
      <Card>
        <div style={{ padding: '12px 16px', height: 'calc(100vh - 320px)', minHeight: 300 }}>
          {filteredLogs.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              {logs.length === 0 ? 'No log entries' : 'No matching entries'}
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%' }}
              data={filteredLogs}
              followOutput={autoScroll ? 'auto' : false}
              itemContent={(_, log: LogEntry) => (
                <div
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12,
                    padding: '4px 8px', borderRadius: 'var(--radius)', lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, opacity: 0.7 }}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', background: LEVEL_BG[log.level] ?? 'transparent', color: LEVEL_COLORS[log.level] ?? 'var(--text-muted)', flexShrink: 0, minWidth: 38, textAlign: 'center' }}>
                    {log.level}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--accent-cyan)', flexShrink: 0, fontWeight: 500 }}>[{log.source}]</span>
                  <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{log.message}</span>
                </div>
              )}
            />
          )}
        </div>
      </Card>
    </div>
  )
}
