import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { APP_CONSTANTS } from '../constants'
import Skeleton from './Skeleton'
import SessionSettingsPopover from './SessionSettingsPopover'

function renderMarkdown(text) {
  if (!text) return ''
  const BLOCK_TAGS = /<(table|div|ul|ol|pre|blockquote|thead|tbody|tr|td|th)\b/i
  if (BLOCK_TAGS.test(text)) return text
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br>')
}

function fmtTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return fmtTime(ts)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

// ── Session sidebar ────────────────────────────────────────────────────────────

function SessionPanel({ sessions, activeSessionId, agents, onSelect, onCreate, onRename, onDelete, onUpdateSettings, onAddParticipant, onRemoveParticipant }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [settingsSession, setSettingsSession] = useState(null)
  const editRef = useRef(null)

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus()
  }, [editingId])

  const startEdit = (s, e) => {
    e.stopPropagation()
    setEditingId(s.id)
    setEditName(s.name)
  }

  const commitEdit = async () => {
    if (editName.trim() && editName !== sessions.find(s => s.id === editingId)?.name) {
      await onRename(editingId, editName.trim())
    }
    setEditingId(null)
  }

  const handleCreate = async () => {
    const name = newName.trim() || `Chat ${sessions.length + 1}`
    setCreating(false)
    setNewName('')
    await onCreate(name)
  }

  return (
    <div style={{
      width: 240, minWidth: 240, borderRight: '1px solid var(--border)',
      background: 'var(--sidebar)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Sessions</span>
        <button onClick={() => setCreating(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 18 }}>+</button>
      </div>

      {creating && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }} placeholder="Name..." style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 12, padding: '5px 8px', borderRadius: 6, outline: 'none' }} />
          <button onClick={handleCreate} style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 5, padding: '0 8px', cursor: 'pointer' }}>✓</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.map(s => {
          const isActive = s.id === activeSessionId
          const isEditing = editingId === s.id
          const hasCtx = !!s.systemContext?.trim() || s.isGroup
          return (
            <div key={s.id} onClick={() => !isEditing && onSelect(s.id)} className="session-row" style={{ padding: '10px 12px', cursor: 'pointer', background: isActive ? 'var(--accent-glow)' : 'transparent', borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <input ref={editRef} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }} onBlur={commitEdit} style={{ width: '100%', background: 'var(--card)', border: '1px solid var(--accent)', color: 'var(--text)', fontSize: 12, padding: '2px 5px', borderRadius: 4, outline: 'none' }} />
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: isActive ? 'var(--text)' : 'var(--muted2)', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.isGroup ? '👥 ' : ''}{s.name}
                      {hasCtx && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.isGroup ? 'var(--cyan)' : 'var(--accent)' }} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{s.isGroup ? `${(s.participants?.length || 0) + 1} agents • ` : ''}{fmtDate(s.updatedAt || s.createdAt)}</div>
                  </>
                )}
              </div>
              {!isEditing && (
                <div style={{ display: 'flex', gap: 2, opacity: isActive ? 1 : 0 }} className="session-action">
                  <button onClick={(e) => { e.stopPropagation(); setSettingsSession(s) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>⚙️</button>
                  <button onClick={(e) => startEdit(s, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✏️</button>
                  {!s.pinned && <button onClick={(e) => { e.stopPropagation(); onDelete(s.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>🗑</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {settingsSession && (
        <SessionSettingsPopover
          session={settingsSession}
          agents={agents}
          onClose={() => setSettingsSession(null)}
          onSave={onUpdateSettings}
          onAddParticipant={onAddParticipant}
          onRemoveParticipant={onRemoveParticipant}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ChatTab({
  send, agents, messages, setMessages, isStreaming, setIsStreaming,
  currentAgentId, setCurrentAgentId, wsReady, isHistoryLoading, setIsHistoryLoading,
}) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('brain')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(r => r.json()),
    staleTime: 5000,
  })

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const effectiveAgentId = activeSession?.agentId || activeSessionId

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!wsReady) return
    setMessages([])
    setIsHistoryLoading(true)
    send({ type: 'load_history', agentId: effectiveAgentId, limit: APP_CONSTANTS.CHAT_HISTORY_LIMIT })
  }, [wsReady, effectiveAgentId, send, setMessages, setIsHistoryLoading])

  useEffect(() => {
    setCurrentAgentId(effectiveAgentId)
  }, [effectiveAgentId, setCurrentAgentId])

  const sendChat = useCallback(() => {
    const content = input.trim()
    if (!content || isStreaming || !wsReady) return
    setIsStreaming(true)
    setMessages(prev => [...prev, { id: Date.now(), type: 'user', content, timestamp: Date.now() }])
    setInput('')
    send({ type: 'chat', content, agentId: effectiveAgentId, requestId: Date.now().toString(36) })
  }, [input, isStreaming, wsReady, effectiveAgentId, send, setIsStreaming, setMessages])

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }

  const handleInputChange = useCallback((e) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 21 * 10 + 20) + 'px'
  }, [])

  useEffect(() => { if (!input && textareaRef.current) textareaRef.current.style.height = '42px' }, [input])

  const handleSelectSession = (sessionId) => setActiveSessionId(sessionId)
  const handleCreateSession = async (name) => {
    const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const session = await r.json()
    refetchSessions()
    setActiveSessionId(session.id)
  }
  const handleRenameSession = async (id, name) => {
    await fetch(`/api/sessions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    refetchSessions()
  }
  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this session?')) return
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    refetchSessions()
    if (activeSessionId === id) setActiveSessionId('brain')
  }
  const handleUpdateSettings = async (id, data) => {
    await fetch(`/api/sessions/${id}/mode`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    refetchSessions()
  }
  const handleAddParticipant = async (sessionId, agentId) => {
    await fetch(`/api/sessions/${sessionId}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId }) })
    refetchSessions()
  }
  const handleRemoveParticipant = async (sessionId, agentId) => {
    await fetch(`/api/sessions/${sessionId}/participants/${agentId}`, { method: 'DELETE' })
    refetchSessions()
  }

  const clearChat = () => {
    if (!confirm('Clear messages?')) return
    send({ type: 'clear_chat', agentId: effectiveAgentId })
  }

  const summarizeChat = async () => {
    if (isSummarizing) return
    setIsSummarizing(true)
    const tempId = Date.now()
    setMessages(prev => [...prev, { id: tempId, type: 'system', content: '⏳ Compacting...' }])
    try {
      const r = await fetch('/api/memory/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId: effectiveAgentId }) })
      const d = await r.json()
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: '✅ **Compacted**\n\n' + (d.summary || '') } : m))
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, type: 'error', content: 'Failed: ' + e.message } : m))
    } finally { setIsStreaming(false); setIsSummarizing(false) }
  }

  const canSummarize = !isSummarizing && messages.length >= 4

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <SessionPanel
        sessions={sessions} agents={agents} activeSessionId={activeSessionId}
        onSelect={handleSelectSession} onCreate={handleCreateSession} onRename={handleRenameSession} onDelete={handleDeleteSession}
        onUpdateSettings={handleUpdateSettings} onAddParticipant={handleAddParticipant} onRemoveParticipant={handleRemoveParticipant}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, background: 'var(--sidebar)', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>{activeSession?.isGroup ? '👥' : '🧠'}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{activeSession?.name || 'Central Brain'}</span>
          {activeSession?.isGroup && <span style={{ fontSize: 10, background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 10 }}>{activeSession.mode.toUpperCase()}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={summarizeChat} disabled={!canSummarize} style={btnGhost}>{isSummarizing ? '...' : '📄 Compact'}</button>
            <button onClick={clearChat} style={btnGhost}>🗑 Clear</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => <MessageItem key={msg.id} msg={msg} botAvatar="🧠" />)}
          {isStreaming && !messages.some(m => m.type === 'streaming') && <TypingIndicator avatar="🧠" />}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)', display: 'flex', gap: 8 }}>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKey} placeholder="Message..." style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: 13, padding: '10px 14px', borderRadius: 10, resize: 'none', outline: 'none', height: 42 }} />
          <button onClick={sendChat} disabled={isStreaming || !input.trim()} style={btnPrimary}>{isStreaming ? '⏳' : '↑'}</button>
        </div>
      </div>
    </div>
  )
}

function BotAvatar({ avatar }) {
  return <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{avatar}</div>
}

function UserMessage({ content, timestamp }) {
  return (
    <div className="msg" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{ background: 'var(--accent)', color: '#fff', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', fontSize: 14, whiteSpace: 'pre-wrap' }}>{content}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtTime(timestamp)}</div>
      </div>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
    </div>
  )
}

function MessageItem({ msg, botAvatar }) {
  if (msg.type === 'user') return <UserMessage content={msg.content} timestamp={msg.timestamp} />
  if (msg.type === 'tool') return <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--muted)' }}>🔧 {msg.tool}</div>
  if (msg.type === 'error') return <div style={{ background: 'rgba(248,113,113,.1)', padding: '10px', borderRadius: 10, alignSelf: 'flex-start', color: '#f87171' }}>⚠️ {msg.content}</div>

  const isStreaming = msg.type === 'streaming'
  const senderName = msg.senderName || 'Brain'
  const avatar = senderName === 'Brain' ? botAvatar : '🤖'

  return (
    <div className="msg" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <BotAvatar avatar={avatar} />
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {senderName !== 'Brain' && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginLeft: 4 }}>{senderName.toUpperCase()}</div>}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', fontSize: 14 }}>
          {isStreaming ? (msg.tokens ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.tokens) + '<span class="typing-cursor">▌</span>' }} /> : <TypingIndicatorDots />) : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
        </div>
      </div>
    </div>
  )
}

function TypingIndicatorDots() {
  return <span style={{ display: 'inline-flex', gap: 5 }}><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></span>
}

function TypingIndicator({ avatar }) {
  return (
    <div className="msg" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <BotAvatar avatar={avatar} />
      <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', padding: '12px 16px', borderRadius: 10 }}><TypingIndicatorDots /></div>
    </div>
  )
}

const btnGhost = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted2)' }
const btnPrimary = { padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff' }

function ChatHistorySkeleton() { return <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading history...</div> }