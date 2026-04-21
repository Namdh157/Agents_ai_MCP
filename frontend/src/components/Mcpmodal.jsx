import React, { useState } from 'react'

const PRESETS = [
  { type: 'slack',      name: 'Slack',     url: '', auth: 'bearer', description: 'Messaging & notifications' },
  { type: 'monday',     name: 'Monday.com', url: '', auth: 'bearer', description: 'Project management' },
  { type: 'github',     name: 'GitHub',    url: 'https://mcp.github.com/sse', auth: 'bearer', description: 'Code repos, PRs, issues' },
  { type: 'notion',     name: 'Notion',    url: '', auth: 'bearer', description: 'Docs & knowledge base' },
  { type: 'linear',     name: 'Linear',    url: '', auth: 'bearer', description: 'Issue tracker' },
  { type: 'jira',       name: 'Jira',      url: '', auth: 'bearer', description: 'Atlassian issue tracker' },
  { type: 'asana',      name: 'Asana',     url: 'https://mcp.asana.com/sse', auth: 'bearer', description: 'Task management' },
  { type: 'salesforce', name: 'Salesforce', url: '', auth: 'bearer', description: 'CRM' },
  { type: 'custom',     name: 'Custom',    url: '', auth: 'bearer', description: 'Any MCP-compatible server' },
]

export default function McpModal({ server, onClose, onSave }) {
  const isNew = !server?.id
  const [step, setStep] = useState(isNew ? 'preset' : 'form')
  const [form, setForm] = useState({
    type:        server?.type || 'custom',
    name:        server?.name || '',
    url:         server?.url || '',
    authType:    server?.authType || 'bearer',
    authToken:   server?.authToken || '',
    description: server?.description || '',
    enabled:     server?.enabled !== false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectPreset = (preset) => {
    setForm(f => ({
      ...f,
      type: preset.type,
      name: preset.name,
      url: preset.url,
      description: preset.description,
    }))
    setStep('form')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.url.trim()) { setError('URL is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form, server?.id)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--card2)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
    padding: '8px 12px', borderRadius: 8, outline: 'none',
  }
  const labelStyle = { fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 4, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="modal" style={{ background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14, width: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {isNew ? (step === 'preset' ? 'Choose Provider' : 'Configure MCP Server') : `Edit: ${server.name}`}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Preset picker */}
          {step === 'preset' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PRESETS.map(p => (
                <button
                  key={p.type}
                  onClick={() => selectPreset(p)}
                  style={{
                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    background: 'var(--card2)', border: '1px solid var(--border)',
                    textAlign: 'left', transition: 'border-color .15s',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Form */}
          {step === 'form' && (
            <>
              {isNew && (
                <button onClick={() => setStep('preset')} style={{ ...btnGhost, alignSelf: 'flex-start' }}>← Back</button>
              )}
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Slack Workspace" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>MCP Server URL *</label>
                <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://your-mcp-server.com/sse" style={inputStyle} />
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  MCP server endpoint (SSE or HTTP). Check your provider's docs.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Auth Type</label>
                <select value={form.authType} onChange={e => set('authType', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key">API Key (header)</option>
                  <option value="basic">Basic Auth</option>
                  <option value="none">None</option>
                </select>
              </div>
              {form.authType !== 'none' && (
                <div>
                  <label style={labelStyle}>
                    {form.authType === 'bearer' ? 'Bearer Token' : form.authType === 'basic' ? 'user:password' : 'API Key'}
                  </label>
                  <input
                    type="password"
                    value={form.authToken}
                    onChange={e => set('authToken', e.target.value)}
                    placeholder="Paste your token here"
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <label style={labelStyle}>Description (optional)</label>
                <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="What does this server do?" style={inputStyle} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
                Enabled (Brain can use this server's tools)
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</span> : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={btnGhost}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? .6 : 1 }}>
                {saving ? 'Saving...' : isNew ? 'Add Server' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnGhost = { padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted2)' }
const btnPrimary = { padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' }