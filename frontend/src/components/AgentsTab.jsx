import React, { useState } from 'react'
import AgentModal from './AgentModal'
import { APP_CONSTANTS } from '../constants'
import Skeleton from './Skeleton'

const PROVIDER_ICONS = {
  claude: '🟣', gemini: '🔵', openrouter: '🌐', openai: '🟢',
  copilot: '🤖', brain: '🧠',
}

export default function AgentsTab({ agents, isLoading, onRefresh }) {
  const [viewMode, setViewMode] = useState('grid')
  const [modalAgent, setModalAgent] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const openCreate = () => { setModalAgent(null); setShowModal(true) }
  const openEdit   = (a) => { setModalAgent(a); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setModalAgent(null) }

  const handleSave = async (form, id) => {
    // Brain special handling — only model can change
    if (id === 'brain') {
      await fetch('/api/agents/brain', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: form.model }),
      })
      onRefresh()
      return
    }

    const method = id ? 'PUT' : 'POST'
    const url    = id ? `/api/agents/${id}` : '/api/agents'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!r.ok) throw new Error('Save failed')
    onRefresh()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this agent?')) return
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const handleToggle = async (a) => {
    await fetch(`/api/agents/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !a.active }),
    })
    onRefresh()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, background: 'var(--sidebar)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Agents</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          {agents.filter(a => !a._isBrain).length} agents · {agents.filter(a => a.active).length} active
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
            {['grid', 'list'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                background: viewMode === m ? 'var(--accent)' : 'transparent',
                border: 'none', color: viewMode === m ? '#fff' : 'var(--muted2)',
              }}>{m === 'grid' ? '⊞' : '☰'}</button>
            ))}
          </div>
          <button onClick={openCreate} style={btnPrimary}>+ New Agent</button>
          <button onClick={onRefresh} style={btnGhost}>↻</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Skeleton width={36} height={36} radius={8} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="55%" height={12} />
                    <Skeleton width="80%" height={10} />
                  </div>
                </div>
                <Skeleton width="100%" height={28} radius={6} />
              </div>
            ))}
          </div>
        )}

        {!isLoading && (viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {agents.map(a =>
              <AgentCard key={a.id} agent={a} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {agents.map(a =>
              <AgentRow key={a.id} agent={a} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <AgentModal agent={modalAgent} onClose={closeModal} onSave={handleSave} />
      )}
    </div>
  )
}

function AgentCard({ agent, onEdit, onDelete, onToggle }) {
  const isBrain = agent._isBrain
  const icon = isBrain ? '🧠' : (PROVIDER_ICONS[agent.provider] || '🤖')

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${isBrain ? 'rgba(124,127,245,.3)' : 'var(--border)'}`,
      borderRadius: 12, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
      opacity: agent.active ? 1 : .55,
      position: 'relative',
    }}>
      {/* Brain badge */}
      {isBrain && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
          color: 'var(--accent)', background: 'var(--accent-glow)',
          border: '1px solid rgba(124,127,245,.3)',
          borderRadius: 4, padding: '2px 6px', letterSpacing: .5,
          textTransform: 'uppercase',
        }}>Orchestrator</div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: isBrain ? 'var(--accent)' : 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: isBrain ? 64 : 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {agent.name}
            <span style={{ width: APP_CONSTANTS.STATUS_DOT_SIZE, height: APP_CONSTANTS.STATUS_DOT_SIZE, borderRadius: '50%', background: agent.active ? 'var(--green)' : 'var(--muted)', display: 'inline-block', boxShadow: agent.active ? '0 0 5px var(--green)' : 'none' }} />
          </div>
          {agent.description && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.description}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', display: 'flex', gap: 8 }}>
        <span style={{ background: 'var(--card2)', padding: '2px 8px', borderRadius: 4 }}>{agent.provider}</span>
        <span style={{ background: 'var(--card2)', padding: '2px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.model}</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button onClick={() => onEdit(agent)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>
          ✏️ {isBrain ? 'Settings' : 'Edit'}
        </button>
        {!isBrain && (
          <>
            <button onClick={() => onToggle(agent)} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>
              {agent.active ? '⏸ Pause' : '▶ Enable'}
            </button>
            <button onClick={() => onDelete(agent.id)} style={{ ...btnGhost, color: 'var(--red)', borderColor: 'rgba(248,113,113,.3)' }}>🗑</button>
          </>
        )}
      </div>
    </div>
  )
}

function AgentRow({ agent, onEdit, onDelete, onToggle }) {
  const isBrain = agent._isBrain
  const icon = isBrain ? '🧠' : (PROVIDER_ICONS[agent.provider] || '🤖')

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${isBrain ? 'rgba(124,127,245,.3)' : 'var(--border)'}`,
      borderRadius: 8, padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: agent.active ? 1 : .55,
    }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {agent.name}
          {isBrain && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid rgba(124,127,245,.3)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: .5 }}>Orchestrator</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{agent.provider} · {agent.model}</div>
      </div>
      <span style={{ width: APP_CONSTANTS.STATUS_DOT_SIZE, height: APP_CONSTANTS.STATUS_DOT_SIZE, borderRadius: '50%', background: agent.active ? 'var(--green)' : 'var(--muted)', boxShadow: agent.active ? '0 0 5px var(--green)' : 'none' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onEdit(agent)} style={btnGhost}>✏️ {isBrain ? 'Settings' : 'Edit'}</button>
        {!isBrain && (
          <>
            <button onClick={() => onToggle(agent)} style={btnGhost}>{agent.active ? '⏸' : '▶'}</button>
            <button onClick={() => onDelete(agent.id)} style={{ ...btnGhost, color: 'var(--red)' }}>🗑</button>
          </>
        )}
      </div>
    </div>
  )
}

const btnGhost = {
  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--border2)', color: 'var(--muted2)',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
const btnPrimary = {
  padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff',
}