import React, { useState, useRef, useEffect } from 'react'
import Skeleton from './Skeleton'

const LEVELS = ['all', 'info', 'warn', 'error', 'debug']
const LEVEL_COLORS = { info: 'var(--cyan)', warn: 'var(--amber)', error: 'var(--red)', debug: 'var(--muted)', system: 'var(--accent)' }

function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogsTab({ logs, isLoading, onClear }) {
  const [filter, setFilter] = useState('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const endRef = useRef(null)

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter)

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, autoScroll])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8, background: 'var(--sidebar)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Logs</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{filtered.length} entries</span>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {LEVELS.map(l => (
            <button key={l} onClick={() => setFilter(l)} style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              borderRadius: 5, border: `1px solid ${filter === l ? 'var(--accent)' : 'var(--border2)'}`,
              background: filter === l ? 'var(--accent-glow)' : 'transparent',
              color: filter === l ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'var(--mono)',
            }}>{l}</button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
          <button onClick={onClear} style={btnGhost}>🗑 Clear</button>
        </div>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', fontFamily: 'var(--mono)', fontSize: 12 }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 48px 100px 1fr', gap: '0 10px', alignItems: 'center', padding: '6px 0' }}>
                <Skeleton width="100%" height={10} radius={4} />
                <Skeleton width="100%" height={10} radius={4} />
                <Skeleton width="100%" height={10} radius={4} />
                <Skeleton width="100%" height={10} radius={4} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            No {filter === 'all' ? '' : filter} logs yet
          </div>
        )}
        {!isLoading && filtered.map((log, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '80px 48px 100px 1fr',
            gap: '0 10px',
            padding: '3px 16px',
            borderBottom: '1px solid rgba(255,255,255,.03)',
            alignItems: 'baseline',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>{fmtTime(log.timestamp)}</span>
            <span style={{ color: LEVEL_COLORS[log.level] || 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{log.level}</span>
            <span style={{ color: 'var(--accent2)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.source}</span>
            <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{log.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

const btnGhost = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--border2)', color: 'var(--muted2)',
}
