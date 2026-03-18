import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { APP_CONSTANTS } from '../constants'
import Skeleton from './Skeleton'

function renderMarkdown(text) {
  if (!text) return ''

  // If the message contains any block-level HTML, treat the ENTIRE message as HTML.
  // Trying to split/mix markdown + HTML causes </div> fragments to leak as text.
  // Brain intentionally outputs full HTML responses for tables — just pass them through.
  const BLOCK_TAGS = /<(table|div|ul|ol|pre|blockquote|thead|tbody|tr|td|th)\b/i
  if (BLOCK_TAGS.test(text)) return text

  // Pure markdown — safe to process
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

function SessionPanel({ sessions, activeSessionId, onSelect, onCreate, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [contextSession, setContextSession] = useState(null)
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
      width: 200, minWidth: 200, borderRight: '1px solid var(--border)',
      background: 'var(--sidebar)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Sessions</span>
        <button
          onClick={() => setCreating(true)}
          title="New session"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}
        >+</button>
      </div>

      {/* New session input */}
      {creating && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Session name..."
            style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--accent)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, padding: '5px 8px', borderRadius: 6, outline: 'none' }}
          />
          <button onClick={handleCreate} style={{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 5, padding: '0 8px', cursor: 'pointer', fontSize: 13 }}>✓</button>
        </div>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.map(s => {
          const isActive = s.id === activeSessionId
          const isEditing = editingId === s.id
          const hasCtx = !!s.systemContext?.trim()  // ← mới

          return (
            <div
              key={s.id}
              onClick={() => !isEditing && onSelect(s.id)}
              className="session-row"
              style={{
                padding: '9px 12px', cursor: 'pointer',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <input
                    ref={editRef}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={commitEdit}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', background: 'var(--card)',
                      border: '1px solid var(--accent)', color: 'var(--text)',
                      fontFamily: 'var(--font)', fontSize: 12,
                      padding: '2px 5px', borderRadius: 4, outline: 'none',
                    }}
                  />
                ) : (
                  <>
                    <div style={{
                      fontSize: 12,
                      color: isActive ? 'var(--accent2)' : 'var(--text)',
                      fontWeight: isActive ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {s.name}
                      {/* dot nếu có context */}
                      {hasCtx && (
                        <span
                          title="Has session context"
                          style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: 'var(--accent)', flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                      {fmtDate(s.updatedAt || s.createdAt)}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              {!isEditing && (
                <div
                  style={{ display: 'flex', gap: 2, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* ← nút context mới */}
                  <button
                    onClick={() => setContextSession(s)}
                    title="Set session context"
                    className="session-action"
                    style={{
                      background: hasCtx ? 'var(--accent-glow)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: hasCtx ? 'var(--accent)' : 'var(--muted)',
                      fontSize: 11, padding: '2px 3px', borderRadius: 3,
                      opacity: isActive ? 1 : 0,
                    }}
                  >⚙</button>

                  <button
                    onClick={e => startEdit(s, e)}
                    title="Rename"
                    className="session-action"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', fontSize: 12,
                      padding: '2px 3px', borderRadius: 3,
                      opacity: isActive ? 1 : 0,
                    }}
                  >✏️</button>

                  {!s.pinned && (
                    <button
                      onClick={() => onDelete(s.id)}
                      title="Delete session"
                      className="session-action"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--muted)', fontSize: 12,
                        padding: '2px 3px', borderRadius: 3,
                        opacity: isActive ? 1 : 0,
                      }}
                    >🗑</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Context popover */}
      {contextSession && (
        <SessionContextPopover
          session={contextSession}
          onClose={() => setContextSession(null)}
          onSave={async (id, systemContext) => {
            await onUpdateContext(id, systemContext)
            setContextSession(null)
          }}
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

  // Sessions query
  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then(r => r.json()),
    staleTime: 5000,
  })

  // currentAgentId derives from session: if session selected, use session.agentId
  // For 'brain' default session, agentId = 'brain'
  // For custom sessions, agentId = session.id
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const effectiveAgentId = activeSession?.agentId || activeSessionId

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load history when session changes
  useEffect(() => {
    if (!wsReady) return
    setMessages([])
    setIsHistoryLoading(true)
    send({ type: 'load_history', agentId: effectiveAgentId, limit: APP_CONSTANTS.CHAT_HISTORY_LIMIT })
  }, [wsReady, effectiveAgentId, send, setMessages, setIsHistoryLoading])

  // Sync currentAgentId with parent
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

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  // Auto-resize textarea: grows with content, capped at 10 lines
  const MAX_TEXTAREA_HEIGHT = 21 * 10 + 20 // lineHeight * maxLines + padding
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px'
  }, [MAX_TEXTAREA_HEIGHT])

  // Reset height after message is sent
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = '42px'
    }
  }, [input])

  // Session actions
  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId)
  }

  const handleCreateSession = async (name) => {
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const session = await r.json()
    refetchSessions()
    setActiveSessionId(session.id)
  }

  const handleRenameSession = async (id, name) => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    refetchSessions()
  }

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this session and all its messages?')) return
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    refetchSessions()
    if (activeSessionId === id) setActiveSessionId('brain')
  }

  const handleUpdateSessionContext = async (id, systemContext) => {
    await fetch(`/api/sessions/${id}/context`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemContext }),
    })
    refetchSessions()
  }

  const clearChat = () => {
    if (!confirm('Clear messages in this session?')) return
    send({ type: 'clear_chat', agentId: effectiveAgentId })
  }

  const summarizeChat = async () => {
    if (isSummarizing) return
    setIsSummarizing(true)
    const tempId = Date.now()
    setMessages(prev => [...prev, { id: tempId, type: 'system', content: '⏳ Compacting context...' }])
    try {
      const r = await fetch('/api/memory/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: effectiveAgentId }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, content: '✅ **Context compacted**\n\n' + (d.summary || '') } : m
      ))
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, type: 'error', content: 'Compact failed: ' + e.message } : m
      ))
    } finally {
      setIsSummarizing(false)
    }
  }

  const getBotAvatar = () => {
    if (effectiveAgentId === 'brain' || effectiveAgentId.startsWith('session-')) return '🧠'
    return agents.find(a => a.id === effectiveAgentId)?.name?.charAt(0) || '🤖'
  }

  const canSummarize = !isSummarizing && messages.filter(m => m.type === 'user' || m.type === 'assistant').length >= 4

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Session panel */}
      <SessionPanel
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onRename={handleRenameSession}
        onDelete={handleDeleteSession}
        onUpdateContext={handleUpdateSessionContext}
      />

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, background: 'var(--sidebar)', flexShrink: 0 }}>
          {/* Session name */}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {activeSession?.name || 'Chat'}
          </span>

          {/* Agent selector (for sessions, always Brain; for non-session mode, pick agent) */}
          <select
            value={effectiveAgentId.startsWith('session-') ? 'brain' : effectiveAgentId}
            onChange={e => {
              // If switching to an agent, use that agent's id directly
              const val = e.target.value
              if (val === 'brain') {
                setCurrentAgentId(effectiveAgentId)
              } else {
                setCurrentAgentId(val)
              }
            }}
            style={{ background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', outline: 'none' }}
          >
            <option value="brain">🧠 Brain</option>
            {agents.filter(a => a.active).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={summarizeChat}
              disabled={!canSummarize}
              title="Compact context"
              style={{ ...btnGhost, opacity: canSummarize ? 1 : 0.4, cursor: canSummarize ? 'pointer' : 'default' }}
            >
              {isSummarizing
                ? <span style={{ display: 'inline-flex', gap: 3 }}>
                  <div className="typing-dot" style={{ width: 4, height: 4 }} />
                  <div className="typing-dot" style={{ width: 4, height: 4 }} />
                  <div className="typing-dot" style={{ width: 4, height: 4 }} />
                </span>
                : '📄'
              } Compact
            </button>
            <button onClick={clearChat} style={btnGhost}>🗑 Clear</button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg)' }}>
          {isHistoryLoading && messages.length === 0 && <ChatHistorySkeleton />}
          {messages.length === 0 && !isHistoryLoading && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--muted)', padding: 40 }}>
              <div style={{ fontSize: 40, opacity: .3 }}>💬</div>
              <p style={{ fontSize: 13, color: 'var(--muted2)' }}>{activeSession?.name || 'New session'}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>Start a conversation or create a new session from the panel.</p>
              {!wsReady && <p style={{ fontSize: 11, color: 'var(--red)' }}>⚠️ Reconnecting...</p>}
            </div>
          )}
          {messages.map(msg => <MessageItem key={msg.id} msg={msg} botAvatar={getBotAvatar()} />)}
          {isStreaming && !messages.some(m => m.type === 'streaming') && <TypingIndicator avatar={getBotAvatar()} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKey}
            placeholder={wsReady ? 'Message... (Enter to send, Shift+Enter for newline)' : 'Reconnecting...'}
            disabled={!wsReady}
            style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, padding: '10px 14px', borderRadius: 10, resize: 'none', outline: 'none', minHeight: 42, height: 42, lineHeight: '21px', overflowY: 'auto', opacity: wsReady ? 1 : 0.6 }}
          />
          <button
            onClick={sendChat}
            disabled={isStreaming || !wsReady || !input.trim()}
            style={{ ...btnPrimary, padding: '10px 16px', opacity: (isStreaming || !wsReady || !input.trim()) ? 0.4 : 1 }}
          >
            {isStreaming ? '⏳' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChatHistorySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, justifyContent: i % 2 ? 'flex-end' : 'flex-start' }}>
          {i % 2 === 0 && <Skeleton width={APP_CONSTANTS.CHAT_AVATAR_SIZE} height={APP_CONSTANTS.CHAT_AVATAR_SIZE} radius={999} />}
          <div style={{ width: 'min(68%, 540px)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="100%" height={14} radius={10} />
            <Skeleton width="75%" height={14} radius={10} />
          </div>
          {i % 2 === 1 && <Skeleton width={APP_CONSTANTS.CHAT_AVATAR_SIZE} height={APP_CONSTANTS.CHAT_AVATAR_SIZE} radius={999} />}
        </div>
      ))}
    </div>
  )
}

function BotAvatar({ avatar }) {
  return (
    <div style={{ width: APP_CONSTANTS.CHAT_AVATAR_SIZE, height: APP_CONSTANTS.CHAT_AVATAR_SIZE, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
      {avatar}
    </div>
  )
}

const USER_MSG_LINE_HEIGHT = 1.6
const USER_MSG_MAX_LINES = 5
const USER_MSG_MAX_HEIGHT = `${USER_MSG_MAX_LINES * USER_MSG_LINE_HEIGHT}em`

function UserMessage({ content, timestamp }) {
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const textRef = useRef(null)

  useEffect(() => {
    if (!textRef.current) return
    setOverflow(textRef.current.scrollHeight > textRef.current.clientHeight + 2)
  }, [content])

  return (
    <div className="msg" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{
          background: 'var(--accent)', color: '#fff',
          padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
          fontSize: 14, lineHeight: USER_MSG_LINE_HEIGHT,
          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          maxHeight: expanded ? 'none' : USER_MSG_MAX_HEIGHT,
          transition: 'max-height .25s ease',
        }}
          ref={textRef}
        >
          {content}
        </div>
        {(overflow || expanded) && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent2)', fontSize: 11, fontFamily: 'var(--mono)',
              padding: '0 2px',
            }}
          >
            {expanded ? '▲ see less' : '▼ see more'}
          </button>
        )}
        <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
          {fmtTime(timestamp)}
        </div>
      </div>
      <div style={{ width: APP_CONSTANTS.CHAT_AVATAR_SIZE, height: APP_CONSTANTS.CHAT_AVATAR_SIZE, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>
    </div>
  )
}

function MessageItem({ msg, botAvatar }) {
  if (msg.type === 'user') return <UserMessage content={msg.content} timestamp={msg.timestamp} />

  if (msg.type === 'streaming') return (
    <div className="msg" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <BotAvatar avatar={botAvatar} />
      <div style={{ maxWidth: '72%' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
          {msg.tokens
            ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.tokens) + '<span class="typing-cursor">▌</span>' }} />
            : <span style={{ display: 'inline-flex', gap: 5 }}><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></span>}
        </div>
      </div>
    </div>
  )

  if (msg.type === 'assistant') return (
    <div className="msg" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <BotAvatar avatar={botAvatar} />
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', fontSize: 14, lineHeight: 1.6, color: 'var(--text)', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || '') }} />
        {msg.stats?.estimatedTokens && (
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'flex', gap: 8 }}>
            <span>{fmtTime(msg.timestamp)}</span>
            <span>~{msg.stats.estimatedTokens} tokens</span>
            {msg.stats.droppedMessages > 0 && <span>−{msg.stats.droppedMessages} trimmed</span>}
          </div>
        )}
      </div>
    </div>
  )

  if (msg.type === 'tool') return (
    <div style={{ alignSelf: 'center' }}>
      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>🔧 {msg.tool}</span>
    </div>
  )

  if (msg.type === 'error') return (
    <div className="msg" style={{ alignSelf: 'flex-start' }}>
      <div style={{ background: 'rgba(248,113,113,.1)', color: '#ff8080', border: '1px solid rgba(248,113,113,.3)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>⚠️ {msg.content}</div>
    </div>
  )

  if (msg.type === 'system') return (
    <div style={{ alignSelf: 'center', maxWidth: '80%' }}>
      <div style={{ background: 'var(--card2)', color: 'var(--muted2)', fontSize: 12, padding: '8px 14px', borderRadius: 10, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content || '') }} />
    </div>
  )

  return null
}

function TypingIndicator({ avatar }) {
  return (
    <div className="msg" style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
      <BotAvatar avatar={avatar} />
      <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', padding: '12px 16px', borderRadius: 10, display: 'inline-flex', gap: 5 }}>
        <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
      </div>
    </div>
  )
}

const btnGhost = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted2)', display: 'inline-flex', alignItems: 'center', gap: 6 }
const btnPrimary = { padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff' }

// ── Session context popover ────────────────────────────────────────────────────

function SessionContextPopover({ session, onClose, onSave }) {
  const [value, setValue] = useState(session.systemContext || '')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleSave = async () => {
    setSaving(true)
    await onSave(session.id, value)
    setSaving(false)
    onClose()
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: 208,   // width of session panel + 8px gap
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
        gap: 0,
        overflow: 'hidden',
        animation: 'modal-in 0.12s ease',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
            Session Context
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
            {session.name}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Injected into Brain's system prompt for this session only.
          <br />E.g. <em style={{ color: 'var(--muted2)' }}>"Dự án React + Supabase, trả lời bằng tiếng Việt"</em>
        </div>
        <textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Describe the purpose or context of this session..."
          rows={5}
          style={{
            width: '100%',
            background: 'var(--card2)',
            border: '1px solid var(--border2)',
            color: 'var(--text)',
            fontFamily: 'var(--font)',
            fontSize: 12,
            padding: '8px 10px',
            borderRadius: 7,
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.5,
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
        />
        {value.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
            {value.length} chars
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
      }}>
        <button
          onClick={() => { setValue(''); }}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', background: 'transparent',
            border: '1px solid var(--border2)', color: 'var(--muted2)',
          }}
        >Clear</button>
        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', background: 'transparent',
            border: '1px solid var(--border2)', color: 'var(--muted2)',
          }}
        >Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: 'pointer', background: 'var(--accent)',
            border: 'none', color: '#fff',
            opacity: saving ? 0.6 : 1,
          }}
        >{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </div>
  )
}