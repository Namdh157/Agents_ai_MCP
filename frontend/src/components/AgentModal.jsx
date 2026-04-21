import React, { useState } from 'react'

const COPILOT_MODELS = [
  { id: 'gpt-5-mini', label: 'GPT-5 Mini · Free' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini · Free' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini · Free' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash · Free' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · 0.33x' },
  { id: 'gpt-4.1', label: 'GPT-4.1 · 1x' },
  { id: 'gpt-4o', label: 'GPT-4o · 1x' },
  { id: 'gpt-5.1', label: 'GPT-5.1 · 1x' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 · 1x' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro · 1x' },
  { id: 'gpt-5.1-codex', label: 'GPT-5.1-Codex · 1x' },
  { id: 'gpt-5.2', label: 'GPT-5.2 · 1x' },
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1 · 0.25x' },
  { id: 'raptor-mini-preview', label: 'Raptor Mini · Free' },
]

const PROVIDERS = [
  { id: 'copilot',     label: '🤖 Copilot',    note: 'No API key needed' },
  { id: 'claude',      label: '🟣 Claude',      note: 'ANTHROPIC_API_KEY' },
  { id: 'gemini',      label: '🔵 Gemini',      note: 'GEMINI_API_KEY' },
  { id: 'openai',      label: '🟢 OpenAI',      note: 'OPENAI_API_KEY' },
  { id: 'openrouter',  label: '🌐 OpenRouter',  note: 'OPENROUTER_API_KEY' },
]

export default function AgentModal({ agent, onClose, onSave }) {
  const isBrain = agent?._isBrain === true
  const isNew   = !agent?.id

  const [tab, setTab] = useState('general')
  const [form, setForm] = useState({
    name:             agent?.name || '',
    description:      agent?.description || '',
    provider:         agent?.provider || 'copilot',
    model:            agent?.model || 'gpt-5-mini',
    apiKey:           agent?.apiKey || '',
    systemPrompt:     agent?.systemPrompt || '',
    active:           agent?.active !== false,
    skills:           agent?.skills || [],
    contextNotes:     agent?.contextNotes || '',
    autoUpdateContext: agent?.autoUpdateContext || false,
  })
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [importUrl, setImportUrl]   = useState('')
  const [importSearch, setImportSearch] = useState('')
  const [importResults, setImportResults] = useState([])
  const [importing, setImporting]   = useState(false)
  const [importMsg, setImportMsg]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!isBrain && !form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form, agent?.id)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addSkill = () => {
    const s = skillInput.trim()
    if (!s || form.skills.includes(s)) return
    set('skills', [...form.skills, s])
    setSkillInput('')
  }
  const removeSkill = (s) => set('skills', form.skills.filter(x => x !== s))

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true); setImportMsg('')
    try {
      const r = await fetch('/api/skills/preview?url=' + encodeURIComponent(importUrl))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      set('skills', [...new Set([...form.skills, ...d.instructions])])
      setImportMsg(`✅ Added ${d.instructions.length} instructions from "${d.name}"`)
      setImportUrl('')
    } catch (e) { setImportMsg('❌ ' + e.message) }
    finally { setImporting(false) }
  }

  const handleSearchClawhub = async () => {
    if (!importSearch.trim()) return
    setImporting(true); setImportMsg('')
    try {
      const r = await fetch('/api/skills/search?q=' + encodeURIComponent(importSearch) + '&limit=8')
      const d = await r.json()
      setImportResults(d.results || [])
      if (!d.results?.length) setImportMsg('No results found')
    } catch (e) { setImportMsg('❌ ' + e.message) }
    finally { setImporting(false) }
  }

  const handleImportSlug = async (slug) => {
    setImporting(true); setImportMsg('')
    try {
      const r = await fetch('/api/skills/preview?slug=' + encodeURIComponent(slug))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      set('skills', [...new Set([...form.skills, ...d.instructions])])
      setImportMsg(`✅ Added ${d.instructions.length} from "${d.name}"`)
    } catch (e) { setImportMsg('❌ ' + e.message) }
    finally { setImporting(false) }
  }

  const inputStyle = {
    width: '100%', background: 'var(--card2)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
    padding: '8px 12px', borderRadius: 8, outline: 'none',
  }
  const labelStyle = { fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 4, display: 'block' }

  // Tabs available: Brain only gets 'model' + 'skills'; normal agents get all 3
  const tabs = isBrain
    ? [['model', '⚙️ Model'], ['skills', '🔧 Skills']]
    : [['general', 'General'], ['skills', 'Skills'], ['context', 'Context']]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="modal" style={{ background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14, width: 540, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isBrain && <span style={{ fontSize: 20 }}>🧠</span>}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                {isBrain ? 'Brain Settings' : isNew ? '+ New Agent' : `Edit: ${agent.name}`}
              </div>
              {isBrain && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  Model and skills only — system prompt is managed in brain.js
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === id ? 'var(--accent)' : 'transparent'}`,
              color: tab === id ? 'var(--accent)' : 'var(--muted)',
            }}>{label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Brain: model tab ── */}
          {isBrain && tab === 'model' && (
            <>
              <div style={{ background: 'var(--accent-glow)', border: '1px solid rgba(124,127,245,.2)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--muted2)', lineHeight: 1.6 }}>
                Brain always uses <strong style={{ color: 'var(--accent2)' }}>GitHub Copilot</strong> as provider.
                Only the model can be changed here.
              </div>
              <div>
                <label style={labelStyle}>Model</label>
                <select value={form.model} onChange={e => set('model', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {COPILOT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </>
          )}

          {/* ── Normal agent: general tab ── */}
          {!isBrain && tab === 'general' && (
            <>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Agent name" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="What does this agent do?" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Provider</label>
                  <select value={form.provider} onChange={e => set('provider', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    {PROVIDERS.find(p => p.id === form.provider)?.note}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Model</label>
                  {form.provider === 'copilot'
                    ? <select value={form.model} onChange={e => set('model', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        {COPILOT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    : <input value={form.model} onChange={e => set('model', e.target.value)} placeholder="e.g. claude-3-sonnet" style={inputStyle} />
                  }
                </div>
              </div>
              {form.provider !== 'copilot' && (
                <div>
                  <label style={labelStyle}>API Key <span style={{ color: 'var(--muted)' }}>(leave empty to use env var)</span></label>
                  <input type="password" value={form.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-..." style={inputStyle} />
                </div>
              )}
              <div>
                <label style={labelStyle}>System Prompt</label>
                <textarea value={form.systemPrompt} onChange={e => set('systemPrompt', e.target.value)} placeholder="You are a helpful assistant..." rows={5} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted2)' }}>
                <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
                Active
              </label>
            </>
          )}

          {/* ── Skills tab (Brain + normal agents) ── */}
          {tab === 'skills' && (
            <>
              <div>
                <label style={labelStyle}>Skills / Instructions</label>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                  Write in <strong style={{ color: 'var(--accent2)' }}>English</strong>.
                  {isBrain && ' These are injected into Brain\'s context alongside its system prompt.'}
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSkill()} placeholder="e.g. Always respond in markdown tables" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={addSkill} style={{ ...btnPrimary, padding: '8px 14px' }}>Add</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.skills.map(s => (
                    <span key={s} style={{ background: 'var(--accent-glow)', color: 'var(--accent2)', border: '1px solid rgba(124,127,245,.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                      <button onClick={() => removeSkill(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
                    </span>
                  ))}
                  {form.skills.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 12 }}>No skills yet.</span>}
                </div>
              </div>

              {/* ClawHub import */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                  🦞 Import from ClawHub / URL
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {[['url', '🔗 URL'], ['search', '🔍 Search']].map(([id, label]) => (
                    <button key={id} onClick={() => { setImportSearch(''); setImportResults([]); setImportMsg('') }} style={{ padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 5, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted)' }}>{label}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={importUrl} onChange={e => setImportUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImportUrl()} placeholder="Raw GitHub URL to SKILL.md" style={{ ...inputStyle, flex: 1, fontSize: 12 }} />
                  <button onClick={handleImportUrl} disabled={importing} style={{ ...btnPrimary, padding: '8px 12px', fontSize: 11, whiteSpace: 'nowrap' }}>{importing ? '...' : 'Import'}</button>
                </div>
                {importMsg && <div style={{ fontSize: 11, color: importMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{importMsg}</div>}
              </div>
            </>
          )}

          {/* ── Context tab (normal agents only) ── */}
          {!isBrain && tab === 'context' && (
            <>
              <div>
                <label style={labelStyle}>Context Notes</label>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Injected into every conversation as accumulated knowledge.</p>
                <textarea value={form.contextNotes} onChange={e => set('contextNotes', e.target.value)} placeholder="Key facts, preferences, background..." rows={8} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted2)' }}>
                <input type="checkbox" checked={form.autoUpdateContext} onChange={e => set('autoUpdateContext', e.target.checked)} />
                Auto-update context after each conversation
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>⚠️ {error}</span> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? .6 : 1 }}>
              {saving ? 'Saving...' : isBrain ? 'Save Settings' : isNew ? 'Create Agent' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const btnGhost   = { padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted2)' }
const btnPrimary = { padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' }