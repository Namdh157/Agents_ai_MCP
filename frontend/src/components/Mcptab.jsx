import React, { useState } from 'react'
import Skeleton from './Skeleton'
import McpModal from './McpModal'

const PROVIDER_ICONS = {
  slack: '💬', monday: '📋', github: '🐱', notion: '📝',
  linear: '🔷', jira: '🎯', asana: '✅', salesforce: '☁️',
  custom: '🔌',
}

function ToolBadge({ tool }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--mono)',
      background: 'var(--card2)', color: 'var(--muted2)',
      border: '1px solid var(--border)', borderRadius: 4,
      padding: '2px 6px',
    }}>{tool}</span>
  )
}

export default function McpTab({ servers, isLoading, onRefresh }) {
  const [showModal, setShowModal] = useState(false)
  const [editServer, setEditServer] = useState(null)
  const [testingId, setTestingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [error, setError] = useState('')

  const handleSave = async (form, id) => {
    const method = id ? 'PUT' : 'POST'
    const url = id ? `/api/mcp/servers/${id}` : '/api/mcp/servers'
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!r.ok) {
      const d = await r.json()
      throw new Error(d.error || 'Save failed')
    }
    onRefresh()
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this MCP server?')) return
    await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const handleConnect = async (id) => {
    setTestingId(id)
    setError('')
    try {
      const r = await fetch(`/api/mcp/servers/${id}/connect`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onRefresh()
    } catch (e) {
      setError(`Connect failed: ${e.message}`)
    } finally {
      setTestingId(null)
    }
  }

  const handleDisconnect = async (id) => {
    await fetch(`/api/mcp/servers/${id}/disconnect`, { method: 'POST' })
    onRefresh()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, background: 'var(--sidebar)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>MCP Servers</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          {servers.length} configured · {servers.filter(s => s.connected).length} connected
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => { setEditServer(null); setShowModal(true) }} style={btnPrimary}>+ Add Server</button>
          <button onClick={onRefresh} style={btnGhost}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Intro */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text)' }}>🔌 Model Context Protocol (MCP)</strong> — Connect Brain to external services like Slack, Monday, GitHub, Notion and more.
          Once connected, Brain can use these services directly in chat via the <code style={{ fontFamily: 'var(--mono)', background: 'var(--card2)', padding: '1px 5px', borderRadius: 3 }}>mcp_call</code> tool.
          <br />You can also ask Brain to add a server: <em>"Connect to Slack, my MCP URL is https://..."</em>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--red)', display: 'flex', justifyContent: 'space-between' }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1].map(i => <Skeleton key={i} width="100%" height={80} radius={12} />)}
          </div>
        )}

        {!isLoading && servers.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 60, color: 'var(--muted)' }}>
            <div style={{ fontSize: 40, opacity: .3 }}>🔌</div>
            <p style={{ fontSize: 13 }}>No MCP servers configured yet.</p>
            <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, marginTop: 4 }}>+ Add Your First Server</button>
          </div>
        )}

        {!isLoading && servers.map(server => {
          const icon = PROVIDER_ICONS[server.type] || PROVIDER_ICONS.custom
          const isExpanded = expandedId === server.id
          const isTesting = testingId === server.id

          return (
            <div key={server.id} style={{ background: 'var(--card)', border: `1px solid ${server.connected ? 'rgba(52,211,153,.2)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{server.name}</span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: server.connected ? 'var(--green)' : 'var(--muted)', boxShadow: server.connected ? '0 0 5px var(--green)' : 'none' }} />
                    {server.connected && <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--mono)' }}>connected</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {server.url}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {server.toolCount > 0 && (
                    <button onClick={() => setExpandedId(isExpanded ? null : server.id)} style={{ ...btnGhost, fontSize: 10 }}>
                      {server.toolCount} tools {isExpanded ? '▲' : '▼'}
                    </button>
                  )}
                  {server.connected ? (
                    <button onClick={() => handleDisconnect(server.id)} style={btnGhost}>Disconnect</button>
                  ) : (
                    <button onClick={() => handleConnect(server.id)} disabled={isTesting} style={{ ...btnPrimary, opacity: isTesting ? .6 : 1 }}>
                      {isTesting ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                  <button onClick={() => { setEditServer(server); setShowModal(true) }} style={btnGhost}>✏️</button>
                  <button onClick={() => handleDelete(server.id)} style={{ ...btnGhost, color: 'var(--red)', borderColor: 'rgba(248,113,113,.3)' }}>🗑</button>
                </div>
              </div>

              {/* Expanded tools */}
              {isExpanded && server.tools?.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--card2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Available tools:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {server.tools.map(t => <ToolBadge key={t} tool={t} />)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showModal && (
        <McpModal
          server={editServer}
          onClose={() => { setShowModal(false); setEditServer(null) }}
          onSave={handleSave}
        />
      )}
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