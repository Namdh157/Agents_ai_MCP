/**
 * agents.js — Manage specialized AI agents
 *
 * On first run, no default agents are seeded.
 * Users create agents manually via the UI or by asking Brain in chat.
 *
 * Providers: copilot | claude | gemini | openrouter | openai
 *
 * Note: "ollama" provider removed — use "copilot" as the local-first option.
 */

const db = require('./db');
const logger = require('./logger');
const memory = require('./memory');
const { APP_CONSTANTS, AGENT_CONSTANTS } = require('./constants');

let agents = [];

// ─── Persistence ──────────────────────────────────────────────────────────────

async function load() {
  const { data, error } = await db.from('agents').select('*').order('created_at');
  if (error) throw new Error(`[agents] Failed to load agents: ${error.message}`);

  if (!data || data.length === 0) {
    // No default agents — start fresh
    agents = [];
    logger.info('system', 'No agents found in Supabase. Create agents via UI or ask Brain.');
    return;
  }

  agents = data.map(r => ({ ...r.data, id: r.id }));
  // Ensure all agents have the required fields with defaults
  agents = agents.map(a => ({
    skills: [],
    contextNotes: '',
    autoUpdateContext: false,
    ...a,
  }));
  logger.info('system', `Agents loaded from Supabase: ${agents.length}`);
}

function persistAgent(agent) {
  db.from('agents').upsert({ id: agent.id, data: agent, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) logger.warn('agents', `Persist failed for ${agent.id}: ${error.message}`);
    });
}

function deleteAgent(id) {
  (async () => {
    try {
      await db.from('agents').delete().eq('id', id);
    } catch (err) {
      logger.warn('agents', `Delete failed for ${id}: ${err.message}`);
    }
  })();
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

function getAll() { return agents; }
function getById(id) { return agents.find(a => a.id === id); }

function create(data) {
  const agent = {
    id: data.id || data.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36),
    name: data.name,
    description: data.description || '',
    provider: data.provider || 'copilot',
    model: data.model || APP_CONSTANTS.DEFAULT_BRAIN_MODEL,
    systemPrompt: data.systemPrompt || 'You are a helpful assistant.',
    apiKey: data.apiKey || '',
    apiKeyVar: data.apiKeyVar || '',
    skills: Array.isArray(data.skills) ? data.skills : [],
    contextNotes: data.contextNotes || '',
    autoUpdateContext: data.autoUpdateContext !== undefined ? !!data.autoUpdateContext : false,
    active: true,
    createdAt: Date.now(),
  };
  agents.push(agent);
  persistAgent(agent);
  logger.info('system', `Agent created: ${agent.name} (${agent.provider}/${agent.model})`);
  return agent;
}

function update(id, data) {
  const idx = agents.findIndex(a => a.id === id);
  if (idx === -1) return null;
  agents[idx] = { ...agents[idx], ...data, id, updatedAt: Date.now() };
  persistAgent(agents[idx]);
  return agents[idx];
}

function remove(id) {
  const idx = agents.findIndex(a => a.id === id);
  if (idx === -1) return false;
  agents.splice(idx, 1);
  deleteAgent(id);
  return true;
}

// ─── Update context notes after agent response ────────────────────────────────

function updateContextNotes(agentId, summary) {
  const agent = getById(agentId);
  if (!agent || !agent.autoUpdateContext) return;

  const maxLen = AGENT_CONSTANTS.CONTEXT_NOTES_MAX_LENGTH;
  const existing = agent.contextNotes || '';
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const newNote = `[${timestamp}] ${summary.slice(0, AGENT_CONSTANTS.CONTEXT_NOTE_SUMMARY_LENGTH)}`;

  const updated = (existing + '\n' + newNote).trim();
  agent.contextNotes = updated.length > maxLen
    ? '...(trimmed)\n' + updated.slice(-maxLen)
    : updated;

  update(agentId, { contextNotes: agent.contextNotes });
}

// ─── Resolve API key ──────────────────────────────────────────────────────────

function resolveApiKey(agent, defaultEnvVar) {
  if (agent.apiKey && agent.apiKey.length > AGENT_CONSTANTS.API_KEY_MIN_LENGTH) return agent.apiKey;
  if (agent.apiKeyVar) {
    const val = process.env[agent.apiKeyVar];
    if (val) return val;
  }
  return process.env[defaultEnvVar] || null;
}

// ─── Provider: GitHub Copilot ─────────────────────────────────────────────────

async function callCopilot({ model, messages, onToken, onDone, onError }) {
  const COPILOT_BASE = process.env.COPILOT_API_URL || APP_CONSTANTS.DEFAULT_COPILOT_API_URL;
  const url = `${COPILOT_BASE}/v1/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gpt-5-mini',
        messages,
        stream: true,
        max_tokens: AGENT_CONSTANTS.PROVIDER_MAX_TOKENS,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      onError(new Error(`copilot-api: ${res.status} ${err}`));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let doneFired = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        if (line.includes('[DONE]')) {
          if (!doneFired && fullContent) { doneFired = true; onDone(fullContent); }
          continue;
        }
        try {
          const data = JSON.parse(line.slice(6));
          const token = data.choices?.[0]?.delta?.content || '';
          if (token) { fullContent += token; onToken(token); }
          if (data.choices?.[0]?.finish_reason === 'stop') {
            if (!doneFired) { doneFired = true; onDone(fullContent); }
          }
        } catch { }
      }
    }

    if (!doneFired && fullContent) onDone(fullContent);
  } catch (e) {
    onError(e);
  }
}

// ─── Provider: Anthropic Claude ───────────────────────────────────────────────

async function callClaude({ model, messages, apiKey, onToken, onDone, onError }) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) { onError(new Error('ANTHROPIC_API_KEY not set')); return; }

  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs = messages.filter(m => m.role !== 'system');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5',
        max_tokens: AGENT_CONSTANTS.PROVIDER_MAX_TOKENS,
        system: systemMsg?.content || '',
        messages: chatMsgs,
        stream: true,
      }),
    });

    if (!res.ok) { onError(new Error(`Claude API: ${res.status}`)); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta') {
            const token = data.delta?.text || '';
            fullContent += token;
            onToken(token);
          }
          if (data.type === 'message_stop') onDone(fullContent);
        } catch { }
      }
    }
  } catch (e) { onError(e); }
}

// ─── Provider: Google Gemini ──────────────────────────────────────────────────

async function callGemini({ model, messages, apiKey, onToken, onDone, onError }) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) { onError(new Error('GEMINI_API_KEY not set')); return; }

  const useModel = model || 'gemini-2.0-flash';
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const chatMsgs = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:streamGenerateContent?alt=sse&key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
          contents: chatMsgs,
          generationConfig: { maxOutputTokens: AGENT_CONSTANTS.PROVIDER_MAX_TOKENS },
        }),
      }
    );

    if (!res.ok) { onError(new Error(`Gemini API: ${res.status}`)); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          const token = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (token) { fullContent += token; onToken(token); }
          if (data.candidates?.[0]?.finishReason) onDone(fullContent);
        } catch { }
      }
    }
  } catch (e) { onError(e); }
}

// ─── Provider: OpenRouter ─────────────────────────────────────────────────────

async function callOpenRouter({ model, messages, apiKey, onToken, onDone, onError }) {
  const key = resolveApiKey({ apiKey }, 'OPENROUTER_API_KEY');
  if (!key) { onError(new Error('OPENROUTER_API_KEY not set')); return; }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || APP_CONSTANTS.DEFAULT_OPENROUTER_REFERER,
        'X-Title': 'Brain OS',
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: AGENT_CONSTANTS.PROVIDER_MAX_TOKENS }),
    });

    if (!res.ok) { onError(new Error(`OpenRouter: ${res.status}`)); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          const token = data.choices?.[0]?.delta?.content || '';
          if (token) { fullContent += token; onToken(token); }
          if (data.choices?.[0]?.finish_reason) onDone(fullContent);
        } catch { }
      }
    }
  } catch (e) { onError(e); }
}

// ─── Provider: OpenAI ─────────────────────────────────────────────────────────

async function callOpenAI({ model, messages, apiKey, onToken, onDone, onError }) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) { onError(new Error('OPENAI_API_KEY not set')); return; }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: model || 'gpt-4o', messages, stream: true, max_tokens: AGENT_CONSTANTS.PROVIDER_MAX_TOKENS }),
    });

    if (!res.ok) { onError(new Error(`OpenAI: ${res.status}`)); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          const token = data.choices?.[0]?.delta?.content || '';
          if (token) { fullContent += token; onToken(token); }
          if (data.choices?.[0]?.finish_reason === 'stop') onDone(fullContent);
        } catch { }
      }
    }
  } catch (e) { onError(e); }
}

// ─── Run agent ────────────────────────────────────────────────────────────────

async function runAgent({ agentId, userInput, onToken, onDone, onError }) {
  const agent = getById(agentId);
  if (!agent) { onError(new Error(`Agent not found: ${agentId}`)); return; }

  // Build system prompt: base + skills + context notes
  let fullSystemPrompt = agent.systemPrompt || 'You are a helpful assistant.';

  if (agent.skills && agent.skills.length > 0) {
    fullSystemPrompt += '\n\n## Skills & Instructions\n' +
      agent.skills.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  if (agent.contextNotes && agent.contextNotes.trim()) {
    fullSystemPrompt += '\n\n## Context Notes (accumulated knowledge)\n' + agent.contextNotes;
  }

  const assembled = memory.assemblePrompt({
    currentInput: userInput,
    agentId,
    systemPrompt: fullSystemPrompt,
    tokenBudget: AGENT_CONSTANTS.TOKEN_BUDGET,
  });

  const messages = [
    { role: 'system', content: assembled.systemPrompt },
    ...assembled.context,
    { role: 'user', content: userInput },
  ];

  logger.info(`agent:${agent.name}`, `Running. Context: ${assembled.stats.selectedMessages} msgs`);

  memory.store('user', userInput, agentId);

  const wrappedDone = (content) => {
    memory.store('assistant', content, agentId);

    if (agent.autoUpdateContext && content.length > AGENT_CONSTANTS.AUTO_UPDATE_MIN_RESPONSE_LENGTH) {
      const summary = `Q: ${userInput.slice(0, AGENT_CONSTANTS.AUTO_UPDATE_QUESTION_PREVIEW_LENGTH)} → A: ${content.slice(0, AGENT_CONSTANTS.AUTO_UPDATE_ANSWER_PREVIEW_LENGTH)}`;
      updateContextNotes(agentId, summary);
    }

    onDone(content, assembled.stats);
  };

  const dispatch = {
    claude: callClaude,
    gemini: callGemini,
    openrouter: callOpenRouter,
    openai: callOpenAI,
    copilot: callCopilot,
  };

  const fn = dispatch[agent.provider];
  if (!fn) { onError(new Error(`Unknown provider: ${agent.provider}. Valid: copilot, claude, gemini, openrouter, openai`)); return; }

  const defaultEnvVars = {
    claude: 'ANTHROPIC_API_KEY',
    gemini: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    openai: 'OPENAI_API_KEY',
    copilot: null,
  };

  const apiKey = defaultEnvVars[agent.provider] !== null
    ? resolveApiKey(agent, defaultEnvVars[agent.provider] || '')
    : null;

  await fn({ model: agent.model, messages, apiKey, onToken, onDone: wrappedDone, onError });
}

module.exports = {
  init: load,
  getAll,
  getById,
  create,
  update,
  remove,
  runAgent,
  updateContextNotes,
};