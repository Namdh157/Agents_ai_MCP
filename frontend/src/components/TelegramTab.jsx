import React, { useState } from 'react'
import { APP_CONSTANTS } from '../constants'
import Skeleton from './Skeleton'

export default function TelegramTab({ status, messages, isLoading, onRefresh }) {
  const [token, setToken] = useState('')
  const [ownerChatId, setOwnerChatId] = useState(status?.ownerChatId || '')
  const [testMsg, setTestMsg] = useState('')
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const connected = status?.connected

  const handleConnect = async () => {
    if (!token.trim()) { setError('Token required'); return }
    setLoading('connect')
    setError('')
    try {
      const r = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setInfo(`Connected as @${d.username}`)
      setToken('')
      onRefresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading('')
    }
  }

  const handleDisconnect = async () => {
    setLoading('disconnect')
    try {
      await fetch('/api/telegram/disconnect', { method: 'POST' })
      onRefresh()
    } finally {
      setLoading('')
    }
  }

  const handleSetOwner = async () => {
    if (!ownerChatId.trim()) return
    setLoading('owner')
    try {
      await fetch('/api/telegram/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: ownerChatId }),
      })
      setInfo('Owner chat ID set')
      onRefresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading('')
    }
  }

  const handleSendTest = async () => {
    if (!testMsg.trim()) return
    setLoading('send')
    try {
      const r = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMsg }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setInfo('Message sent!')
      setTestMsg('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading('')
    }
  }

  const inputStyle = {
    flex: 1, background: 'var(--card2)', border: '1px solid var(--border2)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
    padding: '8px 12px', borderRadius: 8, outline: 'none',
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 48, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, background: 'var(--sidebar)', flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Telegram</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--mono)' }}>
          <span style={{ width: APP_CONSTANTS.STATUS_DOT_SIZE, height: APP_CONSTANTS.STATUS_DOT_SIZE, borderRadius: '50%', background: connected ? 'var(--green)' : 'var(--muted)', display: 'inline-block', boxShadow: connected ? '0 0 5px var(--green)' : 'none' }} />
          <span style={{ color: 'var(--muted)' }}>{connected ? `@${status.username}` : 'Disconnected'}</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={onRefresh} style={btnGhost}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {isLoading && (
          <>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton width="32%" height={14} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton width="100%" height={36} radius={8} />
                <Skeleton width={120} height={36} radius={8} />
              </div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton width="28%" height={14} />
              <Skeleton width="70%" height={10} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton width="100%" height={36} radius={8} />
                <Skeleton width={88} height={36} radius={8} />
              </div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton width="25%" height={14} />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={40} radius={8} />
              ))}
            </div>
          </>
        )}

        {/* Notification */}
        {!isLoading && (error || info) && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 12,
            background: error ? 'rgba(248,113,113,.1)' : 'rgba(52,211,153,.1)',
            border: `1px solid ${error ? 'rgba(248,113,113,.3)' : 'rgba(52,211,153,.3)'}`,
            color: error ? 'var(--red)' : 'var(--green)',
          }}>
            {error || info}
            <button onClick={() => { setError(''); setInfo('') }} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* Connection card */}
        {!isLoading && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
            {connected ? '✅ Bot Connected' : '🔌 Connect Bot'}
          </div>
          {connected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                Username: @{status.username}<br />
                {status.ownerChatId && `Owner Chat ID: ${status.ownerChatId}`}
              </div>
              <button onClick={handleDisconnect} disabled={loading === 'disconnect'} style={{ ...btnDanger, alignSelf: 'flex-start' }}>
                {loading === 'disconnect' ? 'Disconnecting...' : '⏹ Disconnect'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="Bot token from @BotFather"
                style={inputStyle}
              />
              <button onClick={handleConnect} disabled={loading === 'connect'} style={btnPrimary}>
                {loading === 'connect' ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          )}
        </div>
        )}

        {/* Owner Chat ID */}
        {!isLoading && connected && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Owner Chat ID</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
              Your personal Telegram chat ID. Send /start to the bot to get it, or use <code style={{ fontFamily: 'var(--mono)', background: 'var(--card2)', padding: '1px 4px', borderRadius: 4 }}>@userinfobot</code>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={ownerChatId}
                onChange={e => setOwnerChatId(e.target.value)}
                placeholder="e.g. 123456789"
                style={inputStyle}
              />
              <button onClick={handleSetOwner} disabled={loading === 'owner'} style={btnPrimary}>
                {loading === 'owner' ? 'Saving...' : 'Set'}
              </button>
            </div>
          </div>
        )}

        {/* Test send */}
        {!isLoading && connected && status.ownerChatId && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Send Test Message</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTest()}
                placeholder="Test message..."
                style={inputStyle}
              />
              <button onClick={handleSendTest} disabled={loading === 'send'} style={btnPrimary}>
                {loading === 'send' ? 'Sending...' : '✈️ Send'}
              </button>
            </div>
          </div>
        )}

        {/* Messages list */}
        {!isLoading && messages.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
              Recent Messages ({messages.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {[...messages].reverse().map((m, i) => (
                <div key={i} style={{
                  background: 'var(--card2)', borderRadius: 8, padding: '8px 12px',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  borderLeft: `3px solid ${m.direction === 'out' ? 'var(--accent)' : 'var(--green)'}`,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.direction === 'out' ? '→ Sent' : `← ${m.from || 'User'}`}</span>
                    <span>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnGhost = {
  padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--border2)', color: 'var(--muted2)',
}
const btnPrimary = {
  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', whiteSpace: 'nowrap',
}
const btnDanger = {
  padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', background: 'rgba(248,113,113,.1)',
  border: '1px solid rgba(248,113,113,.3)', color: 'var(--red)',
}
