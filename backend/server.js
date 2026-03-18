#!/usr/bin/env node
/**
 * Brain OS — Main Server
 * Run: node server.js [--port 3333] [--model gpt-5-mini]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { APP_CONSTANTS, PATH_CONSTANTS } = require('./src/constants');
const db = require('./src/db');
const sessions = require('./src/sessions');

const logger = require('./src/logger');
const memory = require('./src/memory');
const brain = require('./src/brain');
const agents = require('./src/agents');
const telegram = require('./src/telegram');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const PORT = parseInt(getArg('--port', process.env.PORT || String(APP_CONSTANTS.DEFAULT_PORT)));
const MODEL = getArg('--model', process.env.BRAIN_MODEL || APP_CONSTANTS.DEFAULT_BRAIN_MODEL);

const app = express();
app.use(express.json({ limit: APP_CONSTANTS.JSON_BODY_LIMIT }));
app.use(express.static(PATH_CONSTANTS.FRONTEND_DIST_DIR));

let selfLearn;
try { selfLearn = require('./src/self-learn'); } catch { selfLearn = null; }

// ── Status ─────────────────────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const { BRAIN_CONSTANTS } = require('./src/constants');
  const brainConfig = brain.getConfig();
  res.json({
    brain: {
      available: brainConfig.available,
      model: brainConfig.model,
      models: brainConfig.models || brain.KNOWN_MODELS,
      provider: 'copilot',
      baseUrl: brainConfig.baseUrl,
    },
    supabase: db.getStatus(),
    telegram: telegram.getStatus(),
    memorySize: memory.getHistory().length,
    agentCount: agents.getAll().length,
    uptime: Math.round(process.uptime()),
    searchBackend: process.env.BRAVE_API_KEY ? 'Brave Search' : 'DuckDuckGo',
    contextHealth: memory.getContextHealth('brain', BRAIN_CONSTANTS.TOKEN_BUDGET),
  });
});

app.post('/api/brain/check', async (req, res) => {
  const ok = await brain.checkOllama();
  res.json({ available: ok, ...brain.getConfig() });
});

app.post('/api/brain/model', (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  brain.setModel(model);
  res.json({ ok: true, model });
});

// ── Agents ─────────────────────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  const { BRAIN_CONSTANTS } = require('./src/constants');
  const brainConfig = brain.getConfig();

  // Brain virtual agent — always first, not stored in Supabase
  const brainAgent = {
    id: 'brain',
    name: 'Brain',
    description: 'Central AI orchestrator. Manages tools, agents, and MCP servers.',
    provider: 'copilot',
    model: brainConfig.model,
    active: brainConfig.available,
    skills: [],          // Brain uses BRAIN_SYSTEM prompt, not skills array
    contextNotes: '',
    autoUpdateContext: false,
    _isBrain: true,      // flag for frontend to handle specially
    createdAt: 0,
  };

  res.json([brainAgent, ...agents.getAll()]);
});
// Also handle PUT /api/agents/brain to update Brain's model
app.put('/api/agents/brain', (req, res) => {
  const { model } = req.body;
  if (model) brain.setModel(model);
  const brainConfig = brain.getConfig();
  res.json({
    id: 'brain',
    name: 'Brain',
    model: brainConfig.model,
    _isBrain: true,
    ok: true,
  });
});
app.post('/api/agents', (req, res) => res.status(201).json(agents.create(req.body)));
app.put('/api/agents/:id', (req, res) => {
  const agent = agents.update(req.params.id, req.body);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json(agent);
});
app.delete('/api/agents/:id', (req, res) => {
  const ok = agents.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.get('/api/agents/:id/skills', (req, res) => {
  const agent = agents.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json({ skills: agent.skills || [] });
});
app.put('/api/agents/:id/skills', (req, res) => {
  const { skills } = req.body;
  if (!Array.isArray(skills)) return res.status(400).json({ error: 'skills must be array' });
  const agent = agents.update(req.params.id, { skills });
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, skills: agent.skills });
});

app.get('/api/agents/:id/context', (req, res) => {
  const agent = agents.getById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json({ contextNotes: agent.contextNotes || '', autoUpdateContext: agent.autoUpdateContext || false });
});
app.put('/api/agents/:id/context', (req, res) => {
  const { contextNotes, autoUpdateContext } = req.body;
  const data = {};
  if (contextNotes !== undefined) data.contextNotes = contextNotes;
  if (autoUpdateContext !== undefined) data.autoUpdateContext = !!autoUpdateContext;
  const agent = agents.update(req.params.id, data);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, contextNotes: agent.contextNotes, autoUpdateContext: agent.autoUpdateContext });
});
app.delete('/api/agents/:id/context', (req, res) => {
  const agent = agents.update(req.params.id, { contextNotes: '' });
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Skills (ClawHub import) ────────────────────────────────────────────────────

// Import tools/skills.js directly (not the tool runner — the helpers)
const skillsModule = require('./src/tools/skills');

/**
 * POST /api/skills/import
 * Body: { slug?, url?, content?, target_agent_id? }
 */
app.post('/api/skills/import', async (req, res) => {
  const { slug, url, content, target_agent_id } = req.body;
  if (!slug && !url && !content) {
    return res.status(400).json({
      error: 'Provide slug (e.g. "thesethrose/agent-browser"), url, or content',
    });
  }

  try {
    let rawContent;
    if (content) {
      rawContent = content;
    } else if (url) {
      rawContent = await skillsModule.fetchSkillFromUrl(url);
    } else {
      rawContent = await skillsModule.fetchSkillContent(slug);
    }

    const skillData = skillsModule.parseSkillMd(rawContent, slug || '');

    if (target_agent_id) {
      const agent = agents.getById(target_agent_id);
      if (!agent) return res.status(404).json({ error: `Agent not found: ${target_agent_id}` });

      const newSkills = [...new Set([...(agent.skills || []), ...skillData.skills])];
      agents.update(target_agent_id, { skills: newSkills });

      logger.info('system', `Skill "${skillData.name}" imported into agent "${agent.name}"`);
      return res.json({
        ok: true,
        action: 'added_to_agent',
        agent_id: target_agent_id,
        agent_name: agent.name,
        skill_name: skillData.name,
        instructions_added: skillData.skills.length,
      });
    }

    res.json({ ok: true, action: 'skill_parsed', ...skillData });
  } catch (e) {
    logger.error('system', `Skill import error: ${e.message}`);
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/skills/search?q=...&limit=10
 * Search ClawHub via openclaw/skills GitHub tree
 */
app.get('/api/skills/search', async (req, res) => {
  const { q, limit = '10' } = req.query;
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    // Use GitHub API to search the openclaw/skills repo
    const encoded = encodeURIComponent(q);
    const url = `https://api.github.com/search/code?q=${encoded}+repo:openclaw/skills+filename:SKILL.md&per_page=${Math.min(parseInt(limit), 20)}`;

    const res2 = await fetch(url, {
      headers: {
        'User-Agent': 'Brain-OS/1.0',
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN ? { 'Authorization': `token ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res2.ok) {
      const data = await res2.json();
      const results = (data.items || []).map(item => {
        // path: "skills/thesethrose/agent-browser/SKILL.md"
        const parts = item.path.split('/');
        const author = parts[1] || '';
        const slug = parts[2] || '';
        return {
          slug: `${author}/${slug}`,
          name: slug,
          author,
          pageUrl: `https://clawhub.ai/${author}/${slug}`,
          rawUrl: `https://raw.githubusercontent.com/openclaw/skills/main/${item.path}`,
          repository: item.repository?.full_name || 'openclaw/skills',
        };
      });
      return res.json({ results, total: data.total_count || results.length, source: 'GitHub Search' });
    }
  } catch { /* fall through to simple listing */ }

  // Fallback: return a message explaining the limitation
  res.json({
    results: [],
    note: 'GitHub search unavailable (rate limit or no GITHUB_TOKEN). Import skills directly by slug: "author/skill-name".',
    examples: [
      { slug: 'thesethrose/agent-browser', description: 'Headless browser automation' },
      { slug: 'openclaw/web-search', description: 'Web search integration' },
      { slug: 'openclaw/github', description: 'GitHub operations' },
    ],
  });
});

/**
 * GET /api/skills/preview?slug=thesethrose/agent-browser
 * Preview a skill without importing
 */
app.get('/api/skills/preview', async (req, res) => {
  const { url, slug } = req.query;
  if (!url && !slug) return res.status(400).json({ error: 'url or slug required' });

  try {
    const rawContent = url
      ? await skillsModule.fetchSkillFromUrl(url)
      : await skillsModule.fetchSkillContent(slug);

    const parsed = skillsModule.parseSkillMd(rawContent, slug || '');
    res.json({ ok: true, ...parsed, raw: rawContent.slice(0, 3000) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Memory ─────────────────────────────────────────────────────────────────────
app.get('/api/memory', (req, res) => {
  const { agentId, limit } = req.query;
  res.json(memory.getHistory(agentId || null, parseInt(limit) || APP_CONSTANTS.DEFAULT_MEMORY_API_LIMIT));
});
app.delete('/api/memory', (req, res) => {
  memory.clearHistory(req.query.agentId || null);
  res.json({ ok: true });
});
app.post('/api/memory/summarize', async (req, res) => {
  const summary = await brain.summarizeHistory(req.body.agentId || 'brain');
  res.json({ summary });
});

// ── Context health ─────────────────────────────────────────────────────────────

// GET /api/context/health?agentId=brain
// Returns context utilization, health status, and compact recommendation
app.get('/api/context/health', (req, res) => {
  const { agentId = 'brain' } = req.query;
  const { BRAIN_CONSTANTS } = require('./src/constants');
  res.json(memory.getContextHealth(agentId, BRAIN_CONSTANTS.TOKEN_BUDGET));
});

// ── Tools ──────────────────────────────────────────────────────────────────────
const brainTools = require('./src/tools');
app.get('/api/tools', (req, res) => {
  res.json({
    tools: brainTools.TOOL_DEFINITIONS.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
    count: brainTools.TOOL_DEFINITIONS.length,
  });
});

// ── Self-learn ─────────────────────────────────────────────────────────────────

// GET /api/lessons?type=...&priority=...&status=...&limit=50
app.get('/api/lessons', (req, res) => {
  if (!selfLearn) return res.json({ lessons: [], count: 0, stats: {} });
  const { type, priority, status, limit = '50' } = req.query;
  let results = selfLearn.getLessons();
  if (type) results = results.filter(l => l.type === type);
  if (priority) results = results.filter(l => l.priority === priority);
  if (status) results = results.filter(l => l.status === status);
  results = results
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount || b.lastSeen - a.lastSeen)
    .slice(0, parseInt(limit));
  res.json({
    lessons: results,
    count: results.length,
    stats: selfLearn.getStats ? selfLearn.getStats() : {},
  });
});

// GET /api/lessons/promoted — only promoted (permanent rules)
app.get('/api/lessons/promoted', (req, res) => {
  if (!selfLearn) return res.json({ lessons: [], count: 0 });
  const promoted = selfLearn.getPromotedLessons ? selfLearn.getPromotedLessons() : [];
  res.json({ lessons: promoted, count: promoted.length });
});

// GET /api/lessons/stats
app.get('/api/lessons/stats', (req, res) => {
  if (!selfLearn) return res.json({});
  res.json(selfLearn.getStats ? selfLearn.getStats() : {});
});

// PATCH /api/lessons/:id — resolve or wont_fix a lesson
app.patch('/api/lessons/:id', (req, res) => {
  if (!selfLearn) return res.status(503).json({ error: 'self-learn not available' });
  const { status = 'resolved' } = req.body;
  if (!['resolved', 'wont_fix'].includes(status)) {
    return res.status(400).json({ error: 'status must be resolved or wont_fix' });
  }
  const updated = selfLearn.resolvelesson(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'Lesson not found' });
  res.json({ ok: true, lesson: updated });
});

// DELETE /api/lessons — clear all
app.delete('/api/lessons', (req, res) => {
  if (selfLearn?.clearLessons) selfLearn.clearLessons();
  res.json({ ok: true });
});

// GET /api/lessons/workspace/:file — read workspace files
app.get('/api/lessons/workspace/:file', (req, res) => {
  const allowed = ['LEARNINGS.md', 'ERRORS.md', 'FEATURE_REQUESTS.md'];
  const { file } = req.params;
  if (!allowed.includes(file)) return res.status(400).json({ error: 'Unknown file' });

  const path = require('path');
  const fs = require('fs');
  const { PATH_CONSTANTS } = require('./src/constants');
  const filepath = path.join(PATH_CONSTANTS.BACKEND_ROOT, 'workspace', file);

  if (!fs.existsSync(filepath)) return res.json({ content: '', exists: false });
  res.json({ content: fs.readFileSync(filepath, 'utf8'), exists: true, file });
});

// ── Logs ───────────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.json(logger.getLogs(parseInt(req.query.limit) || APP_CONSTANTS.DEFAULT_LOGS_API_LIMIT, req.query.level || null));
});
app.delete('/api/logs', (req, res) => { logger.clearLogs(); res.json({ ok: true }); });

// ── Telegram ───────────────────────────────────────────────────────────────────
app.get('/api/telegram', (req, res) => res.json(telegram.getStatus()));
app.get('/api/telegram/messages', (req, res) => res.json(telegram.getMessages()));
app.post('/api/telegram/connect', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const info = await telegram.connect(token);
    res.json({ ok: true, username: info.username });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/telegram/owner', (req, res) => {
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  telegram.setOwnerChatId(chatId);
  res.json({ ok: true, chatId: String(chatId) });
});
app.post('/api/telegram/send', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try { res.json(await telegram.sendToOwner(message)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/telegram/disconnect', async (req, res) => {
  await telegram.disconnect();
  res.json({ ok: true });
});

// ── MCP Servers ────────────────────────────────────────────────────────────────
const mcp = require('./src/mcp-manager');
app.get('/api/mcp/servers', (req, res) => res.json(mcp.getAll()));

app.post('/api/mcp/servers', (req, res) => {
  const server = mcp.create(req.body);
  res.status(201).json(server);
});

app.put('/api/mcp/servers/:id', (req, res) => {
  const server = mcp.update(req.params.id, req.body);
  if (!server) return res.status(404).json({ error: 'Not found' });
  res.json(server);
});

app.delete('/api/mcp/servers/:id', (req, res) => {
  const ok = mcp.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.post('/api/mcp/servers/:id/connect', async (req, res) => {
  try {
    const result = await mcp.connect(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/mcp/servers/:id/disconnect', async (req, res) => {
  try {
    await mcp.disconnect(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/mcp/servers/:id/tools', async (req, res) => {
  const server = mcp.getById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  res.json({ tools: server.tools || [], toolCount: server.toolCount || 0 });
});

// ── Sessions ───────────────────────────────────────────────────────────────────

// GET /api/sessions
app.get('/api/sessions', (req, res) => {
  res.json(sessions.getAll());
});

// POST /api/sessions — create new session
app.post('/api/sessions', (req, res) => {
  const session = sessions.create({ name: req.body.name });
  res.status(201).json(session);
});

// PUT /api/sessions/:id — rename
app.put('/api/sessions/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const s = sessions.rename(req.params.id, name);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// DELETE /api/sessions/:id — delete session + its messages
app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const ok = sessions.remove(id);
  if (!ok) return res.status(id === 'brain' ? 403 : 404).json({ error: id === 'brain' ? 'Cannot delete default session' : 'Not found' });
  // Also clear messages for this session
  memory.clearHistory(id);
  res.json({ ok: true });
});

app.put('/api/sessions/:id/context', (req, res) => {
  const { systemContext } = req.body
  if (systemContext === undefined) return res.status(400).json({ error: 'systemContext required' })
  const s = sessions.update(req.params.id, { systemContext })
  if (!s) return res.status(404).json({ error: 'Not found' })
  res.json({ ok: true, systemContext: s.systemContext })
})


// ─── WebSocket ─────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[WS] New connection from ${ip}`);
  logger.registerClient(ws);
  telegram.registerClient(ws);
  mcp.registerClient(ws);
  ws.send(JSON.stringify({ type: 'connected', message: 'Brain OS WebSocket ready' }));

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'chat') {
      const { content, agentId = 'brain', requestId } = msg;
      if (!content?.trim()) return;

      logger.info(
        agentId === 'brain' || agentId.startsWith('session-') ? 'brain' : `agent:${agentId}`,
        `→ ${content.slice(0, APP_CONSTANTS.LOG_PREVIEW_LENGTH)}`
      );

      const send = (payload) => ws.send(JSON.stringify({ ...payload, requestId }));
      const onToken = (token) => send({ type: 'chat_token', token });
      const onDone = (c, stats) => {
        send({ type: 'chat_done', stats });
        // Touch session updatedAt so it bubbles to top of list
        if (agentId.startsWith('session-')) sessions.touch(agentId);
      };
      const onError = (err) => send({ type: 'chat_error', error: err.message });
      const onToolCall = (info) => send({ type: 'tool_call', ...info });

      // Brain orchestrator handles:
      //   - 'brain'          (default session)
      //   - 'session-*'      (named sessions — isolated context, same Brain brain)
      if (agentId === 'brain' || agentId.startsWith('session-')) {
        await brain.chat({
          userInput: content,
          agentId,          // ← passes session ID so memory is isolated per session
          onToken, onDone, onError, onToolCall,
        });
      } else {
        // Specialist agents (translator, dev-agent, etc.)
        const agent = agents.getById(agentId);
        if (!agent) { onError(new Error(`Agent '${agentId}' not found`)); return; }
        await agents.runAgent({ agentId, userInput: content, onToken, onDone, onError });
      }
    }

    if (msg.type === 'clear_chat') {
      memory.clearHistory(msg.agentId || null);
      ws.send(JSON.stringify({ type: 'chat_cleared' }));
    }

    if (msg.type === 'load_history') {
      const history = memory.getHistory(msg.agentId || null, msg.limit || APP_CONSTANTS.DEFAULT_WS_HISTORY_LIMIT);
      ws.send(JSON.stringify({ type: 'history', messages: history }));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[WS] Connection closed: ${code} ${reason}`);
    logger.removeClient(ws);
    mcp.removeClient(ws);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await db.assertConnection();
  } catch (err) {
    console.error('[startup] Supabase required but unavailable.');
    console.error(`[startup] ${err.message}`);
    process.exit(1);
  }

  await sessions.init();
  await logger.init();
  await memory.init();
  if (selfLearn) await selfLearn.init();
  await agents.init();
  await telegram.init(brain);
  await mcp.init();
  brain.setModel(MODEL);
  await brain.loadBrainSkills();
  brain.checkOllama().catch(() => { });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const fs = require('fs');
    const indexPath = path.join(PATH_CONSTANTS.FRONTEND_DIST_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return res.status(404).send('Frontend not built. Run: npm run build:frontend');
    }
    res.sendFile(indexPath);
  });

  server.listen(PORT, () => {
    logger.info('system', `Brain OS on http://localhost:${PORT}`);
    logger.info('system', `Model: ${MODEL} | Search: ${process.env.BRAVE_API_KEY ? 'Brave' : 'DuckDuckGo'}`);
  });
}

start().catch(err => { console.error('Fatal:', err); process.exit(1); });