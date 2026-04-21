import React from 'react'
import { useQuery } from '@tanstack/react-query'
import Skeleton from './Skeleton'

const fetcher = (url) => fetch(url).then(r => r.json())

const LEVEL_COLORS = { info: 'var(--cyan)', warn: 'var(--amber)', error: 'var(--red)', debug: 'var(--muted)' }

function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = 'var(--border2)')}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        {sub && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{sub}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
    </div>
  )
}

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {action}
    </div>
  )
}

export default function Dashboard({ status, agents, logs, lessons, mcpServers, telegramStatus, onNavigate }) {
  const { data: memStats } = useQuery({
    queryKey: ['memory-stats'],
    queryFn: () => fetcher('/api/memory?limit=1'),
    refetchInterval: 15000,
  })

  const { data: lessonStats } = useQuery({
    queryKey: ['lesson-stats-full'],
    queryFn: () => fetcher('/api/lessons/stats').catch(() => ({})),
    refetchInterval: 30000,
  })

  const { data: contextHealth } = useQuery({
    queryKey: ['context-health'],
    queryFn: () => fetcher('/api/context/health').catch(() => null),
    refetchInterval: 10000,
  })

  const activeAgents  = agents.filter(a => a.active).length
  const errorLogs     = logs.filter(l => l.level === 'error').length
  const recentLogs    = logs.slice(-8).reverse()
  const promotedCount = (lessons?.stats?.by_status?.promoted) || 0

  const healthColor = !contextHealth ? 'var(--muted)'
    : contextHealth.health === 'critical' ? 'var(--amber)'
    : contextHealth.health === 'warning'  ? 'var(--amber)'
    : 'var(--green)'

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Uptime: {status.uptime ? `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` : '—'} ·
          Model: {status.brain?.model || '—'} ·
          Search: {status.searchBackend || 'DuckDuckGo'}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard
          icon="🤖" label="Active Agents" value={activeAgents}
          sub={`${agents.length} total`}
          color="var(--accent2)"
          onClick={() => onNavigate('agents')}
        />
        <StatCard
          icon="🔌" label="MCP Servers" value={mcpServers.length}
          sub={`${mcpServers.filter(s => s.connected).length} connected`}
          color="var(--cyan)"
          onClick={() => onNavigate('mcp')}
        />
        <StatCard
          icon="🧠" label="Memory Messages" value={status.memorySize || 0}
          sub={contextHealth ? `ctx ${contextHealth.utilizationPct}%` : ''}
          color={healthColor}
          onClick={() => onNavigate('chat')}
        />
        <StatCard
          icon="🎯" label="Promoted Rules"
          value={promotedCount}
          sub={`${lessonStats?.total || 0} total`}
          color="var(--amber)"
        />
        <StatCard
          icon="⚠️" label="Error Logs" value={errorLogs}
          sub="last session"
          color={errorLogs > 0 ? 'var(--red)' : 'var(--green)'}
          onClick={() => onNavigate('logs')}
        />
        <StatCard
          icon="✈️" label="Telegram"
          value={telegramStatus?.connected ? 'On' : 'Off'}
          sub={telegramStatus?.username ? `@${telegramStatus.username}` : ''}
          color={telegramStatus?.connected ? 'var(--green)' : 'var(--muted)'}
          onClick={() => onNavigate('telegram')}
        />
      </div>

      {/* Two column: agents + logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Agents */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <SectionHeader
            title="Agents"
            action={
              <button
                onClick={() => onNavigate('agents')}
                style={btnGhost}
              >View all →</button>
            }
          />
          {agents.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
              No agents yet. Create one in the Agents tab.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {agents.slice(0, 5).map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: a.active ? 'var(--green)' : 'var(--muted)', boxShadow: a.active ? '0 0 4px var(--green)' : 'none' }} />
                  <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{a.provider}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent logs */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <SectionHeader
            title="Recent Logs"
            action={<button onClick={() => onNavigate('logs')} style={btnGhost}>View all →</button>}
          />
          {recentLogs.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>No logs yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recentLogs.map((log, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 36px 1fr', gap: '0 8px', alignItems: 'baseline', fontSize: 11, fontFamily: 'var(--mono)' }}>
                  <span style={{ color: LEVEL_COLORS[log.level] || 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{log.level}</span>
                  <span style={{ color: 'var(--accent2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.source}</span>
                  <span style={{ color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MCP Servers quick view */}
      {mcpServers.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <SectionHeader
            title="MCP Servers"
            action={<button onClick={() => onNavigate('mcp')} style={btnGhost}>Manage →</button>}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {mcpServers.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'var(--card2)', borderRadius: 8, padding: '6px 12px',
                border: `1px solid ${s.connected ? 'rgba(52,211,153,.3)' : 'var(--border)'}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.connected ? 'var(--green)' : 'var(--muted)', boxShadow: s.connected ? '0 0 4px var(--green)' : 'none' }} />
                <span style={{ fontSize: 12, color: 'var(--text)' }}>{s.name}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{s.toolCount || 0} tools</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lessons breakdown */}
      {lessonStats?.total > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <SectionHeader title="Self-Learning Stats" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {Object.entries(lessonStats.by_type || {}).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{type}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const btnGhost = {
  padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--border2)', color: 'var(--muted2)',
}