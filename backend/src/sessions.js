/**
 * sessions.js — Chat session manager
 *
 * A session = a named conversation context.
 * Each session has a unique agentId (e.g. "session-abc123") that scopes
 * all messages in memory.js. Sessions are separate from AI agents.
 *
 * Default session: "brain" (backward compatible)
 */

const db = require('./db');
const logger = require('./logger');

let sessions = [];

// ─── Default session ───────────────────────────────────────────────────────────

const DEFAULT_SESSION = {
  id: 'brain',
  name: 'Main',
  agentId: 'brain',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  pinned: true,
};

// ─── Persistence ──────────────────────────────────────────────────────────────

async function load() {
  try {
    const { data, error } = await db.from('sessions').select('*').order('created_at', { ascending: false });

    if (error) {
      if (error.message?.includes('does not exist')) {
        logger.info('sessions', 'sessions table not found — using default session');
        sessions = [DEFAULT_SESSION];
        return;
      }
      throw error;
    }

    if (!data || data.length === 0) {
      // First run — seed default session
      sessions = [DEFAULT_SESSION];
      await persist(DEFAULT_SESSION);
    } else {
      sessions = data.map(r => ({ ...r.data, id: r.id }));
      // Ensure default session always exists
      if (!sessions.find(s => s.id === 'brain')) {
        sessions.unshift(DEFAULT_SESSION);
        await persist(DEFAULT_SESSION);
      }
    }

    logger.info('sessions', `Loaded ${sessions.length} session(s)`);
  } catch (e) {
    logger.warn('sessions', `Failed to load sessions: ${e.message} — using default`);
    sessions = [DEFAULT_SESSION];
  }
}

async function persist(session) {
  try {
    await db.from('sessions').upsert({
      id: session.id,
      data: session,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    logger.warn('sessions', `Persist failed for ${session.id}: ${e.message}`);
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function getAll() {
  return [...sessions].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function getById(id) {
  return sessions.find(s => s.id === id);
}

function create({ name }) {
  const id = 'session-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const session = {
    id,
    name: name || `Chat ${sessions.length}`,
    agentId: id,   // session uses its own id as agentId for memory isolation
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned: false,
    systemContext: '',
  };
  sessions.unshift(session);
  persist(session);
  logger.info('sessions', `Created session: "${session.name}" (${id})`);
  return session;
}

function rename(id, name) {
  const s = sessions.find(s => s.id === id);
  if (!s) return null;
  s.name = name;
  s.updatedAt = Date.now();
  persist(s);
  return s;
}

function touch(id) {
  const s = sessions.find(s => s.id === id);
  if (s) {
    s.updatedAt = Date.now();
    persist(s);
  }
}

function remove(id) {
  if (id === 'brain') return false; // can't delete default
  const idx = sessions.findIndex(s => s.id === id);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  (async () => {
    try { await db.from('sessions').delete().eq('id', id); } catch {}
  })();
  return true;
}

module.exports = { init: load, getAll, getById, create, rename, touch, remove };