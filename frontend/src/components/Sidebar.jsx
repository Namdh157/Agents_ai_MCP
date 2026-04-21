import React from 'react'
import { APP_CONSTANTS } from '../constants'

export default function Sidebar({ activeTab, onTabChange, isDark, setIsDark, wsReady, status, telegramStatus, agentCount, mcpCount, logCount }) {
  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'chat',      icon: '💬', label: 'Chat' },
    { id: 'agents',    icon: '🤖', label: 'Agents',   badge: agentCount },
    { id: 'mcp',       icon: '🔌', label: 'MCP',      badge: mcpCount || undefined },
    { id: 'telegram',  icon: '✈️', label: 'Telegram', dot: telegramStatus?.connected },
    { id: 'logs',      icon: '📋', label: 'Logs',     badge: undefined },
  ]

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: 'var(--sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '8px 20px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🧠</div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Brain OS</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: wsReady ? 'var(--green)' : 'var(--red)',
              boxShadow: wsReady ? '0 0 4px var(--green)' : 'none',
              display: 'inline-block', flexShrink: 0,
            }} />
            {wsReady ? 'connected' : 'connecting...'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px' }}>
        {navItems.map(item => {
          const isActive = activeTab === item.id
          return (
            <div
              key={item.id}
              onClick={() => onTabChange(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 6,
                cursor: 'pointer',
                color: isActive ? 'var(--accent)' : 'var(--muted2)',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(124,127,245,.3)' : 'transparent'}`,
                fontSize: 13, fontWeight: 500, marginBottom: 2,
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 16, width: 18, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {/* Dot indicator */}
              {item.dot !== undefined && (
                <span style={{
                  width: APP_CONSTANTS.STATUS_DOT_SIZE, height: APP_CONSTANTS.STATUS_DOT_SIZE,
                  borderRadius: '50%',
                  background: item.dot ? 'var(--green)' : 'var(--muted)',
                  boxShadow: item.dot ? '0 0 5px var(--green)' : 'none',
                }} />
              )}
              {/* Count badge */}
              {item.badge > 0 && (
                <span style={{
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 10, fontFamily: 'var(--mono)',
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  {item.badge}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--mono)' }}>
        <StatusRow
          ok={status.brain?.available}
          text={status.brain?.available ? `${status.brain.model}` : 'copilot offline'}
        />
        <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 10 }}>
          {status.memorySize || 0} msgs in memory
        </div>
        <button
          onClick={() => setIsDark(d => !d)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 10, padding: '7px 10px',
            borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--border2)',
            background: 'var(--card)', color: 'var(--muted2)',
            fontSize: 11, fontFamily: 'var(--mono)',
            width: '100%', transition: 'all .15s',
          }}
        >
          <span>{isDark ? '🌙' : '☀️'}</span>
          <span>{isDark ? 'Dark' : 'Light'}</span>
        </button>
      </div>
    </aside>
  )
}

function StatusRow({ ok, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--muted)' }}>
      <div style={{
        width: APP_CONSTANTS.SIDEBAR_STATUS_DOT_SIZE, height: APP_CONSTANTS.SIDEBAR_STATUS_DOT_SIZE,
        borderRadius: '50%',
        background: ok ? 'var(--green)' : 'var(--red)',
        boxShadow: ok ? '0 0 5px var(--green)' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  )
}