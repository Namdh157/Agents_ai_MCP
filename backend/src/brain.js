/**
 * brain.js — Central AI Orchestrator (Brain OS)
 *
 * Features:
 *   - GitHub Copilot via copilot-api local proxy
 *   - Tool calling loop with parallel execution
 *   - Persistent Brain skills (stored in Supabase config table)
 *   - Per-session memory isolation (agentId scoping)
 *   - Auto-compact context when sessions get long
 *   - Self-learning lesson injection
 *   - Retry on timeout
 */

const logger = require('./logger');
const tools = require('./tools');
const memory = require('./memory');
const { APP_CONSTANTS, BRAIN_CONSTANTS } = require('./constants');

const COPILOT_BASE = process.env.COPILOT_API_URL || APP_CONSTANTS.DEFAULT_COPILOT_API_URL;
const COPILOT_CHAT = `${COPILOT_BASE}/v1/chat/completions`;
const COPILOT_MODELS = `${COPILOT_BASE}/v1/models`;

// ─── Config ───────────────────────────────────────────────────────────────────

const config = {
  available: false,
  model: 'gpt-5-mini',
  models: [],
  provider: 'copilot',
  baseUrl: COPILOT_BASE,
};

const KNOWN_MODELS = [
  { id: 'gpt-5-mini', quota: 'free', label: 'GPT-5 Mini (Free)' },
  { id: 'gpt-4.1-mini', quota: 'free', label: 'GPT-4.1 Mini (Free)' },
  { id: 'gpt-4o-mini', quota: 'free', label: 'GPT-4o Mini (Free)' },
  { id: 'gemini-2.0-flash', quota: 'free', label: 'Gemini 2.0 Flash (Free)' },
  { id: 'claude-haiku-4-5', quota: 'x0.33', label: 'Claude Haiku 4.5 (x0.33)' },
  { id: 'gpt-4.1', quota: 'x1', label: 'GPT-4.1 (x1)' },
  { id: 'gpt-4o', quota: 'x1', label: 'GPT-4o (x1)' },
  { id: 'gpt-5.1', quota: 'x1', label: 'GPT-5.1 (x1)' },
  { id: 'claude-sonnet-4.5', quota: 'x1', label: 'Claude Sonnet 4.5 (x1)' },
  { id: 'gemini-2.5-pro', quota: 'x1', label: 'Gemini 2.5 Pro (x1)' },
  { id: 'gpt-5.1-codex', quota: 'x1', label: 'GPT-5.1 Codex (x1)' },
  { id: 'o1-mini', quota: 'x3', label: 'o1 Mini (x3)' },
  { id: 'o3-mini', quota: 'x3', label: 'o3 Mini (x3)' },
  { id: 'o1', quota: 'x5', label: 'o1 (x5)' },
];

// ─── Persistent Brain skills ───────────────────────────────────────────────────
// Stored in Supabase config table, injected into BRAIN_SYSTEM at chat time.
// Applies to every session — user sets once, persists across restarts.

let brainSkills = [];

async function loadBrainSkills() {
  try {
    const db = require('./db');
    const { data } = await db
      .from('config')
      .select('value')
      .eq('key', 'brain_skills')
      .single();
    if (data?.value) {
      brainSkills = JSON.parse(data.value);
      logger.info('brain', `Loaded ${brainSkills.length} persistent skill(s)`);
    }
  } catch { /* first run — no skills yet, start empty */ }
}

function getSkills() {
  return [...brainSkills];
}

async function setSkills(skills) {
  brainSkills = Array.isArray(skills) ? skills : [];
  try {
    const db = require('./db');
    await db.from('config').upsert({
      key: 'brain_skills',
      value: JSON.stringify(brainSkills),
    });
    logger.info('brain', `Saved ${brainSkills.length} skill(s)`);
  } catch (e) {
    logger.warn('brain', `Failed to persist skills: ${e.message}`);
  }
}

// ─── BRAIN_SYSTEM prompt ───────────────────────────────────────────────────────

const BRAIN_SYSTEM = `You are Brain — the central AI orchestrator of Brain OS.

## CRITICAL: Task Completion Rules

1. **Do NOT announce what you're about to do** — execute immediately.
   - ❌ "Tôi sẽ tìm kiếm thông tin này, chờ một chút..."
   - ✅ [call search_web immediately, deliver results]

2. **Multi-step tasks**: call ALL required tools before writing the final answer.

3. **Never produce a partial response** — if a task needs 5 searches, run all 5, then respond once.

4. **Sequential research pattern**:
   - Broad search → specific lookups (parallel if independent) → synthesize → one response

5. **Parallel tool calls**: prefer parallel over sequential when tasks are independent.

## Core Responsibilities

- Answer conversational questions directly and concisely.
- Use tools for real data/actions — never fabricate.
- Delegate specialized work via call_agent only after verifying IDs with list_agents.
- NEVER call call_agent with a guessed agent ID — always list_agents first.

## Response Guidelines

- Default language: Vietnamese (unless user writes in another language).
- Be direct — deliver results, not commentary about the process.
- Use markdown for structured responses.
- When listing items: use a table or numbered list with consistent fields.
- All auto-generated skills, rules, and instructions MUST be in English.

## Agent Creation Wizard

When user wants to create an agent, follow these steps:
1. Ask purpose
2. Propose name + description
3. Recommend provider/model (table format)
4. Draft system prompt
5. Suggest 3–5 skills (in English)
6. Confirm → call create_agent

## Tool Usage

- search_web + browse_web: for current/external information
- call_agent: route specialized work (translation, coding, research)
- run_pipeline: parallel research across multiple agents
- save_lesson: record patterns that should persist across sessions
- Always prefer parallel tool calls when tasks are independent

## MCP Tool Rules (CRITICAL)

Sub-agents do NOT have access to mcp_call or http_request.
**NEVER use call_agent for tasks requiring mcp_call — Brain calls it directly.**

Correct workflow for MCP data requests:
1. list_mcp_servers() → get exact available tool names
2. mcp_call() → fetch data using EXACT tool name from step 1
3. list_agents() → check if Brain (id: "brain") has formatting skills
4. Apply Brain's formatting skills to the output
5. Brain formats the output itself — never delegate MCP formatting to sub-agents

**NEVER guess tool names.** If mcp_call returns tool-not-found:
→ call mcp_connect to refresh, then retry with the correct name.

When user says "update skill then call Monday":
- list_agents → read current Brain skills
- update_agent(brain) with merged skills (keep existing + add new)
- list_mcp_servers → get tool names
- mcp_call → get data
- Format output applying the new skill immediately

## Skill Management Rules (CRITICAL)

Brain's skills (id: "brain") are **permanent configuration** — they apply to all sessions.
Sub-agent skills only affect that agent's LLM output (no tool access).

**When adding/updating skills:**
- Always call list_agents FIRST to read current skills
- Merge: keep ALL existing skills + add/modify only what was requested
- NEVER pass an empty skills array to update_agent unless user explicitly says "remove all skills"
- Formatting skills (HTML tables, icons, layout) MUST be added to Brain, not sub-agents

**When user says "add skill X":**
1. list_agents() → read Brain's current skills array
2. update_agent({ agent_id: "brain", skills: [...currentSkills, "X"] })
3. Confirm with the user what was added`;

// ─── Copilot availability ──────────────────────────────────────────────────────

async function checkOllama() {
  try {
    const res = await fetch(COPILOT_MODELS, {
      signal: AbortSignal.timeout(BRAIN_CONSTANTS.MODEL_DISCOVERY_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      const discovered = (data.data || []).map(m => {
        const known = KNOWN_MODELS.find(k => k.id === m.id);
        return known || { id: m.id, quota: 'x1', label: m.id };
      });
      config.models = discovered.length ? discovered : KNOWN_MODELS;
      config.available = true;
      logger.info('brain', `✅ copilot-api connected — model: ${config.model}`);
      return true;
    }
  } catch { /* not running */ }
  config.available = false;
  logger.warn('brain', `copilot-api not reachable at ${COPILOT_BASE}. Run: npx copilot-api@latest start`);
  return false;
}

function setModel(model) {
  config.model = model || 'gpt-5-mini';
  logger.info('brain', `Model set: ${config.model}`);
}

function getConfig() { return { ...config }; }

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function fetchWithRetry(url, opts, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      lastError = e;
      const isTimeout =
        e.message?.includes('timeout') ||
        e.message?.includes('fetch failed') ||
        e.cause?.message?.includes('Connect Timeout');
      if (!isTimeout || attempt === maxRetries) throw e;
      const delay = 1500 * (attempt + 1);
      logger.warn('brain', `Timeout (attempt ${attempt + 1}/${maxRetries + 1}), retry in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ─── Prune large tool results before sending to API ──────────────────────────
// Prevents payload bloat that causes timeouts on copilot-api

function pruneLoopMessages(messages) {
  const TOOL_MAX = 1500;
  const HEAD = 600;
  const TAIL = 400;
  const RESP_MAX = 800;
  const SEARCH_MAX = 5;

  return messages.map(m => {
    if (m.role !== 'tool') return m;

    let content = m.content;
    if (typeof content === 'string' && content.length > TOOL_MAX) {
      // Shrink search results
      try {
        const parsed = JSON.parse(content);
        if (parsed?.results?.length > SEARCH_MAX) {
          parsed.results = parsed.results.slice(0, SEARCH_MAX).map(r => ({
            ...r,
            snippet: r.snippet?.slice(0, 200),
          }));
          content = JSON.stringify(parsed);
        }
      } catch { /* not JSON — truncate raw */ }

      if (content.length > TOOL_MAX) {
        content = `${content.slice(0, HEAD)}\n...[${content.length - HEAD - TAIL} chars trimmed]...\n${content.slice(-TAIL)}`;
      }
    }

    if (typeof m.content === 'object') {
      const str = JSON.stringify(m.content);
      if (str.length > RESP_MAX) {
        content = str.slice(0, RESP_MAX) + '...[trimmed]';
      }
    }

    return { ...m, content };
  });
}

// ─── Non-streaming call with tools ────────────────────────────────────────────

async function callWithTools(messages, model) {
  const useModel = model || config.model;
  const pruned = pruneLoopMessages(messages);

  logger.debug('brain', `callWithTools: ${pruned.length} msgs, payload ~${JSON.stringify(pruned).length} chars`);

  const res = await fetchWithRetry(COPILOT_CHAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      messages: pruned,
      tools: tools.TOOL_DEFINITIONS,
      tool_choice: 'auto',
      stream: false,
      max_tokens: BRAIN_CONSTANTS.STREAM_MAX_TOKENS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`copilot-api error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0];
}

// ─── Streaming final response ──────────────────────────────────────────────────

async function streamChat({ messages, model, onToken, onDone, onError }) {
  const useModel = model || config.model;
  const pruned = pruneLoopMessages(messages);

  try {
    const res = await fetchWithRetry(COPILOT_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        messages: pruned,
        stream: true,
        max_tokens: BRAIN_CONSTANTS.STREAM_MAX_TOKENS,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stream error ${res.status}: ${err.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n')
        .filter(l => l.startsWith('data: ') && !l.includes('[DONE]'));
      for (const line of lines) {
        try {
          const token = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || '';
          if (token) { fullContent += token; onToken(token); }
        } catch { /* skip malformed chunk */ }
      }
    }
    onDone(fullContent);
    return fullContent;
  } catch (e) {
    logger.error('brain', `Stream error: ${e.message}`);
    onError(e);
    throw e;
  }
}

// ─── Simple one-shot call (no tools, no streaming) ────────────────────────────

async function call(messages, model = null) {
  const useModel = model || config.model;
  try {
    const res = await fetchWithRetry(COPILOT_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        messages,
        stream: false,
        max_tokens: BRAIN_CONSTANTS.CALL_MAX_TOKENS,
      }),
    });
    if (!res.ok) throw new Error(`copilot-api ${res.status}`);
    const data = await res.json();
    return data.choices[0]?.message?.content || '';
  } catch (e) {
    logger.error('brain', `call() error: ${e.message}`);
    return null;
  }
}

// ─── Main chat entry point ─────────────────────────────────────────────────────

async function chat({ userInput, agentId = 'brain', onToken, onDone, onError, onToolCall }) {
  // Ensure copilot-api is reachable
  if (!config.available) {
    await checkOllama();
    if (!config.available) {
      onError(new Error(
        'copilot-api chưa chạy.\n' +
        'Khởi động: npx copilot-api@latest start\n' +
        '(Lần đầu: npx copilot-api@latest auth)'
      ));
      return;
    }
  }

  // Auto-compact context silently if session is getting long
  await memory.autoCompactIfNeeded(agentId, (msgs) => call(msgs));

  // Build system prompt:
  //   BRAIN_SYSTEM
  //   + Brain's persistent skills (global, all sessions)
  //   + promoted lessons from self-learning
  let selfLearn;
  try { selfLearn = require('./self-learn'); } catch { selfLearn = null; }

  const lessonsContext = selfLearn ? selfLearn.buildLessonsContext(userInput) : '';

  const skillsSection = brainSkills.length > 0
    ? '\n\n## Persistent Brain Skills\n' +
    brainSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '';
    
  const session = require('./sessions').getById(agentId)
  const sessionCtx = session?.systemContext?.trim()
    ? `\n\n## Session Context\n${session.systemContext}` : ''
  const fullSystemPrompt = BRAIN_SYSTEM + skillsSection + sessionCtx + lessonsContext

  // Assemble prompt with context (head/tail preservation, token budget)
  const assembled = memory.assemblePrompt({
    currentInput: userInput,
    agentId,
    systemPrompt: fullSystemPrompt,
    tokenBudget: BRAIN_CONSTANTS.TOKEN_BUDGET,
  });

  logger.debug('brain', `Chat start. agentId=${agentId}, ctx=${assembled.stats.selectedMessages} msgs, ~${assembled.stats.estimatedTokens} tokens`);

  // Store user message
  memory.store('user', userInput, agentId);

  const loopMessages = [
    { role: 'system', content: assembled.systemPrompt },
    ...assembled.context,
    { role: 'user', content: userInput },
  ];

  // ─── Tool calling loop ─────────────────────────────────────────────────────
  //
  // When model returns message with BOTH content AND tool_calls:
  //   content = intermediate thought (not the final answer)
  //   tool_calls = must be executed before responding
  //
  // We only stream to the user when there are NO tool_calls in the response.

  const MAX_LOOPS = BRAIN_CONSTANTS.TOOL_LOOP_LIMIT;

  for (let loop = 1; loop <= MAX_LOOPS; loop++) {
    logger.debug('brain', `Tool loop ${loop}/${MAX_LOOPS}`);

    let choice;
    try {
      choice = await callWithTools(loopMessages, config.model);
    } catch (e) {
      logger.error('brain', `Loop ${loop} error: ${e.message}`);
      onError(e);
      return;
    }

    const msg = choice.message;
    const hasTools = msg.tool_calls?.length > 0;

    // ── No tool calls → final answer ─────────────────────────────────────────
    if (!hasTools) {
      if (msg.content) {
        for (const ch of msg.content) onToken(ch);
        memory.store('assistant', msg.content, agentId);
        onDone(msg.content, assembled.stats);
      } else {
        // Empty content — fall back to streaming
        await streamChat({
          messages: loopMessages,
          model: config.model,
          onToken,
          onDone: (content) => {
            memory.store('assistant', content, agentId);
            onDone(content, assembled.stats);
          },
          onError,
        });
      }
      return;
    }

    // ── Has tool calls → execute, continue loop ───────────────────────────────
    if (msg.content) {
      logger.debug('brain', `Intermediate thought (${msg.content.length}c) + ${msg.tool_calls.length} tool calls`);
    }

    const toolNames = msg.tool_calls.map(t => t.function.name).join(', ');
    logger.debug('brain', `Executing: ${toolNames}`);

    if (onToolCall) {
      msg.tool_calls.forEach(tc =>
        onToolCall({ tool: tc.function.name, args: tc.function.arguments })
      );
    }

    // Add assistant message (required by spec before tool results)
    loopMessages.push(msg);

    // Execute all tool calls in parallel
    const results = await tools.executeToolsParallel(
      msg.tool_calls.map(tc => ({
        id: tc.id,
        function: {
          name: tc.function.name,
          arguments: typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments || '{}')
            : (tc.function.arguments || {}),
        },
      }))
    );

    // Append tool results
    msg.tool_calls.forEach((tc, i) => {
      loopMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(results[i]),
      });
    });
    // Continue loop
  }

  // ── Loop limit hit → force final response ─────────────────────────────────
  logger.warn('brain', `Tool loop limit (${MAX_LOOPS}) reached — forcing final stream`);
  await streamChat({
    messages: loopMessages,
    model: config.model,
    onToken,
    onDone: (content) => {
      memory.store('assistant', content, agentId);
      onDone(content, assembled.stats);
    },
    onError,
  });
}

// ─── Summarize history (for compact button) ────────────────────────────────────

async function summarizeHistory(agentId = 'brain') {
  const history = memory.getHistory(agentId, BRAIN_CONSTANTS.SUMMARY_HISTORY_LIMIT);
  if (history.length < BRAIN_CONSTANTS.SUMMARY_MIN_HISTORY) {
    return 'Chưa đủ lịch sử để tóm tắt.';
  }

  const text = history
    .slice(-BRAIN_CONSTANTS.SUMMARY_HISTORY_LIMIT)
    .map(m => `${m.role}: ${m.content.slice(0, 400)}`)
    .join('\n');

  const result = await call([{
    role: 'user',
    content: `Summarize this conversation concisely in 4–6 bullet points. Preserve key facts, decisions, and user preferences:\n\n${text}`,
  }]);

  if (result) memory.storeSummary(agentId, result, []);
  return result || 'Unable to summarize.';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  checkOllama,
  setModel,
  getConfig,
  getSkills,
  setSkills,
  loadBrainSkills,
  chat,
  call,
  streamChat,
  summarizeHistory,
  KNOWN_MODELS,
};