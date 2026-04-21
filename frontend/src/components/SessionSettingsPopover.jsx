
import React, { useState, useRef, useEffect } from 'react'

export default function SessionSettingsPopover({ session, agents, onClose, onSave, onAddParticipant, onRemoveParticipant }) {
  const [mode, setMode] = useState(session.mode || 'orchestrated')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleSaveMode = async () => {
    setSaving(true)
    await onSave(session.id, { mode })
    setSaving(false)
  }

  const handleAdd = async () => {
    if (!selectedAgentId) return
    await onAddParticipant(session.id, selectedAgentId)
    setSelectedAgentId('')
  }

  // Filter out agents already in the group (and brain)
  const availableAgents = agents.filter(a => 
    a.active && 
    a.id !== 'brain' && 
    !(session.participants || []).includes(a.id)
  )

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: 208,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 200,
        width: 320,
        background: 'var(--card)',
        border: '1px solid var(--border2)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modal-in 0.12s ease',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Group Settings</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{session.name}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Mode Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted2)' }}>ORCHESTRATION MODE</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              style={{ flex: 1, background: 'var(--card2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none' }}
            >
              <option value="orchestrated">🎯 Orchestrated (@mentions)</option>
              <option value="consensus">🤝 Consensus (Collaboration)</option>
              <option value="pipeline">🚀 Pipeline (Sequential)</option>
            </select>
            <button 
              onClick={handleSaveMode}
              disabled={saving || mode === session.mode}
              style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', opacity: (saving || mode === session.mode) ? 0.5 : 1 }}
            >Save</button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
            {mode === 'consensus' 
              ? 'All members discuss in parallel. Best for brainstorming.' 
              : mode === 'pipeline'
                ? 'Members act one by one. Each sees the previous output. Best for workflows.'
                : 'Only the Brain responds unless you @mention a specific agentId.'}
          </p>
        </div>

        {/* Participants Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted2)' }}>PARTICIPANTS</label>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
            {/* Brain is always here */}
            <div style={participantBadge}>🧠 Brain</div>
            
            {(session.participants || []).map(pid => {
              const agent = agents.find(a => a.id === pid)
              if (!agent) return null
              return (
                <div key={pid} style={participantBadge}>
                  {agent.name}
                  <button 
                    onClick={() => onRemoveParticipant(session.id, pid)}
                    style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', marginLeft: 4, padding: 0, fontSize: 14 }}
                  >×</button>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <select
              value={selectedAgentId}
              onChange={e => setSelectedAgentId(e.target.value)}
              style={{ flex: 1, background: 'var(--card2)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 12, padding: '6px 8px', borderRadius: 6, outline: 'none' }}
            >
              <option value="">Add agent...</option>
              {availableAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button 
              onClick={handleAdd}
              disabled={!selectedAgentId}
              style={{ padding: '6px 10px', background: 'var(--card2)', color: 'var(--accent)', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 14, cursor: 'pointer', opacity: !selectedAgentId ? 0.5 : 1 }}
            >+</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const participantBadge = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'var(--accent-glow)', border: '1px solid rgba(124,127,245,.2)',
  color: 'var(--accent)', fontSize: 11, padding: '3px 8px', borderRadius: 20
}
