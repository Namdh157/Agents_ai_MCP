/**
 * mcp-manager.js — MCP server registry + client
 *
 * Supports MCP Streamable HTTP transport (2025-03-26 spec):
 *   Monday.com and other servers requiring Mcp-Session-Id
 *
 * Flow:
 *   1. POST initialize → server returns Mcp-Session-Id in response header
 *   2. All subsequent requests include that Mcp-Session-Id header
 *   3. tools/list to discover available tools
 *   4. tools/call to invoke tools
 */

const { spawn } = require('child_process');
const path = require('path');
const db = require('./db');
const logger = require('./logger');

let servers = [];
let wsClients = new Set();

// In-memory session store: serverId → sessionId
const sessionIds = new Map();

// In-memory child process store: serverId → { process, resolvers: Map<id, {resolve, reject}>, buffer: string }
const stdioProcesses = new Map();

// ─── Persistence ──────────────────────────────────────────────────────────────

async function load() {
  try {
    const { data, error } = await db.from('mcp_servers').select('*').order('created_at', { ascending: false });
    if (error) {
      if (error.message?.includes('does not exist')) {
        logger.info('mcp', 'mcp_servers table not found — run migration');
        return;
      }
      throw error;
    }
    servers = (data || []).map(r => ({ ...r.data, id: r.id }));
    logger.info('mcp', `Loaded ${servers.length} MCP server(s)`);
  } catch (e) {
    logger.warn('mcp', `Failed to load: ${e.message}`);
  }
}

function persist(server) {
  (async () => {
    try {
      await db.from('mcp_servers').upsert({
        id: server.id, data: server, updated_at: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn('mcp', `Persist failed: ${e.message}`);
    }
  })();
}

function broadcast(payload) {
  const str = JSON.stringify(payload);
  for (const ws of wsClients) { try { ws.send(str); } catch {} }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function getAll() { return servers; }
function getById(id) { return servers.find(s => s.id === id); }
function getByName(name) {
  const lower = (name || '').toLowerCase();
  return servers.find(s =>
    s.name.toLowerCase() === lower ||
    s.type.toLowerCase() === lower ||
    s.id === name
  );
}

function create(data) {
  const existing = getByName(data.name);
  if (existing) return existing;

  const server = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name:        data.name,
    type:        data.type || 'custom',
    url:         data.url,
    authType:    data.authType || 'bearer',
    authToken:   data.authToken || '',
    description: data.description || '',
    enabled:     data.enabled !== false,
    connected:   false,
    tools:       [],
    toolCount:   0,
    createdAt:   Date.now(),
  };
  servers.unshift(server);
  persist(server);
  broadcast({ type: 'mcp_updated' });
  logger.info('mcp', `Created: "${server.name}" (${server.url})`);
  return server;
}

function update(id, data) {
  const idx = servers.findIndex(s => s.id === id);
  if (idx === -1) return null;
  servers[idx] = { ...servers[idx], ...data, id, updatedAt: Date.now() };
  persist(servers[idx]);
  return servers[idx];
}

function remove(id) {
  const idx = servers.findIndex(s => s.id === id);
  if (idx === -1) return false;
  servers.splice(idx, 1);
  sessionIds.delete(id);
  (async () => { try { await db.from('mcp_servers').delete().eq('id', id); } catch {} })();
  return true;
}

// ─── Headers ─────────────────────────────────────────────────────────────────

function buildHeaders(server, includeSession = true) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'User-Agent': 'Brain-OS/1.0',
  };

  const token = server.authToken;
  if (token) {
    switch (server.authType) {
      case 'bearer':
        h['Authorization'] = `Bearer ${token}`;
        break;
      case 'api_key':
        h['X-API-Key'] = token;
        break;
      case 'basic':
        h['Authorization'] = `Basic ${Buffer.from(token).toString('base64')}`;
        break;
    }
  }

  // Attach session ID if we have one (required by Monday and Streamable HTTP servers)
  if (includeSession && sessionIds.has(server.id)) {
    h['Mcp-Session-Id'] = sessionIds.get(server.id);
  }

  return h;
}

// ─── Stdio Connection ─────────────────────────────────────────────────────────

async function spawnStdioServer(server) {
  if (stdioProcesses.has(server.id)) {
    return stdioProcesses.get(server.id);
  }

  logger.info('mcp', `${server.name}: Spawning stdio server...`);

  // Parse command (handling quoted paths if necessary)
  // Simple split for now, can be improved
  const parts = server.url.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);

  // Auto-detect CWD from the first path-like argument
  let cwd = process.cwd();
  for (const arg of args) {
    if (arg.includes('/') || arg.includes('\\')) {
      const absolute = path.resolve(arg);
      cwd = path.dirname(absolute);
      break;
    }
  }

  const spawnEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    // On Windows, some system calls fail if SystemRoot or ComSpec is missing
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    ComSpec: process.env.ComSpec || 'cmd.exe',
  };

  logger.debug('mcp', `${server.name}: Spawning with cmd="${cmd}", cwd="${cwd}"`);

  const child = spawn(cmd, args, {
    shell: true,
    cwd,
    env: spawnEnv
  });

  const state = {
    process: child,
    resolvers: new Map(),
    buffer: ''
  };

  stdioProcesses.set(server.id, state);

  child.stdout.on('data', (data) => {
    state.buffer += data.toString();
    const lines = state.buffer.split('\n');
    state.buffer = lines.pop(); // Keep partial line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id && state.resolvers.has(msg.id)) {
          const { resolve, reject } = state.resolvers.get(msg.id);
          state.resolvers.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        logger.debug('mcp', `${server.name} stdout parse error: ${e.message} (Line: ${trimmed.slice(0, 50)})`);
      }
    }
  });

  child.stderr.on('data', (data) => {
    logger.warn('mcp', `${server.name} stderr: ${data.toString().trim()}`);
  });

  child.on('exit', (code) => {
    logger.info('mcp', `${server.name} exited with code ${code}`);
    stdioProcesses.delete(server.id);
    update(server.id, { connected: false });
    broadcast({ type: 'mcp_updated' });
  });

  child.on('error', (err) => {
    logger.error('mcp', `${server.name} spawn error: ${err.message}`);
    stdioProcesses.delete(server.id);
  });

  return state;
}

async function rpcStdio(server, method, params = {}, timeoutMs = 15000) {
  const state = await spawnStdioServer(server);
  const isNotification = method.startsWith('notifications/');
  const id = isNotification ? undefined : rpcId++;
  
  const body = { jsonrpc: '2.0', method, params };
  if (id !== undefined) body.id = id;
  
  const request = JSON.stringify(body) + '\n';

  if (isNotification) {
    try {
      state.process.stdin.write(request);
      return null;
    } catch (e) {
      logger.warn('mcp', `Failed to write notification to stdin: ${e.message}`);
      return null;
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (state.resolvers.has(id)) {
        state.resolvers.delete(id);
        reject(new Error(`Stdio RPC Timeout (${method})`));
      }
    }, timeoutMs);

    state.resolvers.set(id, {
      resolve: (res) => {
        clearTimeout(timeout);
        resolve(res);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    try {
      state.process.stdin.write(request);
    } catch (e) {
      state.resolvers.delete(id);
      reject(new Error(`Failed to write to stdin: ${e.message}`));
    }
  });
}

// ─── JSON-RPC over HTTP ───────────────────────────────────────────────────────

let rpcId = 1;

async function rpcPost(server, method, params = {}, timeoutMs = 15000) {
  if (server.type === 'stdio') {
    return rpcStdio(server, method, params, timeoutMs);
  }

  const isNotification = method.startsWith('notifications/');
  const id = isNotification ? undefined : rpcId++;
  const bodyObj = { jsonrpc: '2.0', method, params };
  if (id !== undefined) bodyObj.id = id;
  const body = JSON.stringify(bodyObj);

  const res = await fetch(server.url, {
    method: 'POST',
    headers: buildHeaders(server),
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (isNotification) return null;

  // Capture session ID from response headers (Monday sets it here on initialize)
  const sessionId = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id');
  if (sessionId) {
    sessionIds.set(server.id, sessionId);
    logger.debug('mcp', `${server.name}: session captured`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    return readSSE(res, id);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

async function readSSE(res, targetId) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines[lines.length - 1];

    for (const line of lines.slice(0, -1)) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;
      try {
        const msg = JSON.parse(raw);
        if (msg.id === targetId) {
          if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
          return msg.result;
        }
      } catch (e) {
        if (e.message && !e.message.startsWith('Unexpected')) throw e;
      }
    }
  }
  return null;
}

// ─── Connect ──────────────────────────────────────────────────────────────────

async function connect(id) {
  const server = getById(id);
  if (!server) throw new Error(`Server not found: ${id}`);

  // Clear stale session
  sessionIds.delete(id);

  logger.info('mcp', `Connecting to "${server.name}"...`);

  // Step 1: initialize — Monday returns Mcp-Session-Id in response headers here
  try {
    await rpcPost(server, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'brain-os', version: '1.0' },
    }, 10000);

    // Send notifications/initialized (required by spec, fire-and-forget)
    rpcPost(server, 'notifications/initialized', {}).catch(() => {});

    logger.debug('mcp', `${server.name}: initialize OK`);
  } catch (e) {
    logger.debug('mcp', `${server.name}: initialize: ${e.message.slice(0, 100)}`);
    // Session ID may still have been captured even if response was non-200
  }

  logger.debug('mcp', `${server.name}: session ${sessionIds.has(id) ? 'active ✓' : 'not required'}`);

  // Step 2: discover tools
  let tools = [];
  try {
    const result = await rpcPost(server, 'tools/list', {}, 10000);
    tools = (result?.tools || []).map(t => typeof t === 'string' ? t : (t.name || t));
    logger.info('mcp', `${server.name}: ${tools.length} tools — ${tools.slice(0, 5).join(', ')}`);
  } catch (e) {
    logger.warn('mcp', `${server.name}: tools/list — ${e.message.slice(0, 120)}`);
  }

  update(id, { connected: true, tools, toolCount: tools.length, lastConnected: Date.now() });
  broadcast({ type: 'mcp_updated' });

  return { connected: true, tools, toolCount: tools.length, sessionActive: sessionIds.has(id) };
}

async function disconnect(id) {
  const server = getById(id);
  if (!server) throw new Error(`Server not found: ${id}`);
  
  if (server.type === 'stdio' && stdioProcesses.has(id)) {
    const state = stdioProcesses.get(id);
    state.process.kill();
    stdioProcesses.delete(id);
  }

  sessionIds.delete(id);
  update(id, { connected: false });
  broadcast({ type: 'mcp_updated' });
  logger.info('mcp', `Disconnected "${server.name}"`);
}

// ─── Call a tool ──────────────────────────────────────────────────────────────

async function callTool({ serverId, serverName, toolName, args = {} }) {
  const server = serverId ? getById(serverId) : getByName(serverName || '');

  if (!server) {
    return {
      error: `MCP server "${serverId || serverName}" not found.`,
      available: servers.map(s => `"${s.name}"`).join(', ') || 'none',
    };
  }

  if (!server.enabled) return { error: `Server "${server.name}" is disabled.` };

  // Auto-connect if no session
  if (!server.connected || !sessionIds.has(server.id)) {
    try {
      await connect(server.id);
    } catch (e) {
      return { error: `"${server.name}" connect failed: ${e.message}` };
    }
  }

  logger.debug('mcp', `${server.name}.${toolName}(${JSON.stringify(args).slice(0, 100)})`);

  try {
    const result = await rpcPost(server, 'tools/call', { name: toolName, arguments: args }, 20000);
    return { ok: true, server: server.name, tool: toolName, result };
  } catch (e) {
    // Session expired — reconnect once and retry
    if (e.message.includes('400') || e.message.toLowerCase().includes('session')) {
      logger.info('mcp', `${server.name}: session expired, reconnecting...`);
      try {
        await connect(server.id);
        const result = await rpcPost(server, 'tools/call', { name: toolName, arguments: args }, 20000);
        return { ok: true, server: server.name, tool: toolName, result };
      } catch (e2) {
        return { error: `${server.name}/${toolName} failed after reconnect: ${e2.message}` };
      }
    }
    return { error: `${server.name}/${toolName}: ${e.message}` };
  }
}

// ─── Summary for Brain context ─────────────────────────────────────────────────

function getMcpToolsSummary() {
  const connected = servers.filter(s => s.connected && s.enabled && s.tools?.length > 0);
  if (!connected.length) return '';
  const lines = connected.map(s =>
    `- ${s.name}: ${s.tools.slice(0, 8).join(', ')}${s.tools.length > 8 ? '...' : ''}`
  );
  return `\n\n## Connected MCP Servers\nUse mcp_call to invoke:\n${lines.join('\n')}`;
}

module.exports = {
  init: load,
  getAll, getById, getByName,
  create, update, remove,
  connect, disconnect, callTool,
  getMcpToolsSummary,
  registerClient: (ws) => wsClients.add(ws),
  removeClient:   (ws) => wsClients.delete(ws),
};