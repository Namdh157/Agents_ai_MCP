/**
 * memory.js — Conversation Memory & Prompt Assembler (v2)
 *
 * Fixes:
 *   - Supabase .delete().in().catch() is not a function → use async IIFE
 *   - Auto-compact: when context > 70%, silently summarize oldest messages
 *     instead of showing a warning banner
 *
 * Context management strategy (OpenClaw-inspired):
 *   - Head/tail preservation: always keep first 2 + last N messages
 *   - Turn-based cutting: never split a user/assistant pair
 *   - Tool result pruning: shrink long tool outputs in-memory
 *   - Auto-compact: when history > AUTO_COMPACT_THRESHOLD, summarize oldest 40%
 */

const db = require('./db');
const { MEMORY_CONSTANTS } = require('./constants');

let history = [];
let summaries = [];

// ─── Thresholds ───────────────────────────────────────────────────────────────

const AUTO_COMPACT_THRESHOLD = 60;    // auto-compact when agentId has > 60 messages
const AUTO_COMPACT_KEEP_RATIO = 0.6;  // after compact, keep newest 60%
const TOOL_RESULT_MAX_CHARS   = 1500;
const TOOL_RESULT_HEAD_CHARS  = 600;
const TOOL_RESULT_TAIL_CHARS  = 300;

// Track which agents are currently being compacted (avoid double-compact)
const compactingAgents = new Set();

// ─── Persistence ──────────────────────────────────────────────────────────────

async function load() {
  const [{ data: msgs, error: msgError }, { data: sums, error: sumError }] = await Promise.all([
    db.from('messages').select('*').order('timestamp', { ascending: true }).limit(MEMORY_CONSTANTS.MAX_HISTORY),
    db.from('summaries').select('*').order('timestamp', { ascending: true }),
  ]);

  if (msgError) throw new Error(`[memory] Failed to load messages: ${msgError.message}`);
  if (sumError) throw new Error(`[memory] Failed to load summaries: ${sumError.message}`);

  history = (msgs || []).map(r => ({
    id: r.id, role: r.role, content: r.content,
    agentId: r.agent_id, timestamp: r.timestamp, ...r.meta,
  }));

  summaries = (sums || []).map(r => ({
    id: r.id, agentId: r.agent_id, summary: r.summary,
    coveredIds: r.covered_ids, timestamp: r.timestamp,
  }));
}

// ─── Store a message ──────────────────────────────────────────────────────────

function store(role, content, agentId = 'brain', meta = {}) {
  const msg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    role,
    content,
    agentId,
    timestamp: Date.now(),
    ...meta,
  };
  history.push(msg);
  if (history.length > MEMORY_CONSTANTS.MAX_HISTORY) history.shift();

  // ✅ Fix: use async IIFE instead of .catch() on Supabase chain
  (async () => {
    try {
      await db.from('messages').insert({
        id: msg.id, role: msg.role, content: msg.content,
        agent_id: msg.agentId, timestamp: msg.timestamp, meta,
      });
    } catch (e) {
      console.warn(`[memory] Failed to persist ${msg.id}: ${e.message}`);
    }
  })();

  return msg;
}

// ─── Auto-compact (silent, no user intervention needed) ──────────────────────

/**
 * When an agent's history exceeds AUTO_COMPACT_THRESHOLD:
 *   1. Take the oldest 40% of messages
 *   2. Build a compact summary string from them
 *   3. Store the summary in Supabase and drop those messages from history
 *
 * This runs silently in the background — no warning shown to user.
 * Brain module calls this before assembling prompts.
 */
async function autoCompactIfNeeded(agentId, brainCallFn) {
  if (compactingAgents.has(agentId)) return; // already in progress

  const agentHistory = history.filter(m => m.agentId === agentId && m.role !== 'system');
  if (agentHistory.length <= AUTO_COMPACT_THRESHOLD) return;

  compactingAgents.add(agentId);

  try {
    // Take oldest 40% to compact
    const compactCount = Math.floor(agentHistory.length * (1 - AUTO_COMPACT_KEEP_RATIO));
    const toCompact = agentHistory.slice(0, compactCount);
    const ids = toCompact.map(m => m.id);

    // Build summary text
    const text = toCompact
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${m.content.slice(0, 300)}`)
      .join('\n');

    if (!text.trim()) {
      compactingAgents.delete(agentId);
      return;
    }

    // Use brain to summarize (passed in as dependency to avoid circular require)
    let summary = null;
    if (brainCallFn) {
      try {
        summary = await brainCallFn([{
          role: 'user',
          content: `Summarize this conversation history concisely in 3-5 bullet points. Preserve key facts, decisions, and user preferences:\n\n${text}`,
        }]);
      } catch { /* ignore — use fallback */ }
    }

    if (!summary) {
      // Fallback: simple truncated text summary
      summary = `[Auto-compacted ${toCompact.length} messages]\n` +
        toCompact
          .filter(m => m.role === 'user')
          .slice(0, 5)
          .map(m => `• User asked: ${m.content.slice(0, 100)}`)
          .join('\n');
    }

    // Store summary and remove compacted messages
    storeSummary(agentId, summary, ids);

    console.log(`[memory] Auto-compacted ${ids.length} messages for agent "${agentId}"`);
  } catch (e) {
    console.warn(`[memory] Auto-compact failed for ${agentId}: ${e.message}`);
  } finally {
    compactingAgents.delete(agentId);
  }
}

// ─── Tool result pruning (in-memory, non-destructive) ─────────────────────────

function pruneContent(content, maxChars = TOOL_RESULT_MAX_CHARS) {
  if (!content || content.length <= maxChars) return content;
  const head = content.slice(0, TOOL_RESULT_HEAD_CHARS);
  const tail = content.slice(-TOOL_RESULT_TAIL_CHARS);
  const trimmed = content.length - TOOL_RESULT_HEAD_CHARS - TOOL_RESULT_TAIL_CHARS;
  return `${head}\n...[${trimmed} chars trimmed]...\n${tail}`;
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','could','should','may','might','to',
  'of','in','for','on','with','at','by','from','and','but','or','i',
  'my','me','you','your','we','our','it','its','this','that','not','no',
  'what','how','why','when','where','who','can','need','want','please',
  'tôi','bạn','và','của','là','có','được','cho','trong','với','này','đây',
]);

function extractKeywords(text) {
  return text.toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > MEMORY_CONSTANTS.KEYWORD_MIN_LENGTH && !STOP_WORDS.has(w));
}

// ─── Score messages ───────────────────────────────────────────────────────────

function scoreMessage(msg, keywords, msgIndex, total) {
  const recencyScore = total > 1 ? msgIndex / (total - 1) : 1;
  let keywordScore = 0;
  if (keywords.length > 0) {
    const msgWords = new Set(extractKeywords(msg.content));
    const matches = keywords.filter(k => msgWords.has(k)).length;
    keywordScore = matches / keywords.length;
  }
  const roleBonus = msg.role === 'user' ? 0.1 : 0;
  return 0.5 * recencyScore + 0.4 * keywordScore + 0.1 * roleBonus;
}

// ─── Head/tail selection ──────────────────────────────────────────────────────

function selectMessagesWithHeadTail(scoredMessages, maxChars, systemLen, currentInputLen) {
  if (!scoredMessages.length) return [];

  const overhead = systemLen + currentInputLen + MEMORY_CONSTANTS.PROMPT_OVERHEAD_CHARS;
  let budgetLeft = maxChars - overhead;
  if (budgetLeft <= 0) return [];

  const msgCost = m => m.content.length + MEMORY_CONSTANTS.MESSAGE_OVERHEAD_CHARS;
  const HEAD_N = 2;
  const TAIL_N = MEMORY_CONSTANTS.ALWAYS_INCLUDE_LAST_N;

  const head   = scoredMessages.slice(0, HEAD_N);
  const tail   = scoredMessages.slice(-TAIL_N);
  const tailIds = new Set(tail.map(m => m.id));
  const headIds = new Set(head.map(m => m.id));
  const middle  = scoredMessages.filter(m => !headIds.has(m.id) && !tailIds.has(m.id));

  const selected = new Map();

  for (const m of tail) {
    const cost = msgCost(m);
    if (budgetLeft >= cost) { selected.set(m.id, m); budgetLeft -= cost; }
  }
  for (const m of head) {
    if (selected.has(m.id)) continue;
    const cost = msgCost(m);
    if (budgetLeft >= cost) { selected.set(m.id, m); budgetLeft -= cost; }
  }
  for (const m of [...middle].sort((a, b) => b._score - a._score)) {
    if (selected.has(m.id)) continue;
    if (selected.size >= MEMORY_CONSTANTS.CONTEXT_MESSAGE_HARD_CAP) break;
    const cost = msgCost(m);
    if (budgetLeft >= cost) { selected.set(m.id, m); budgetLeft -= cost; }
  }

  return [...selected.values()].sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Turn completeness ────────────────────────────────────────────────────────

function ensureTurnCompleteness(selectedMessages, allMessages) {
  const selectedIds = new Set(selectedMessages.map(m => m.id));
  const toAdd = [];

  for (const msg of selectedMessages) {
    if (msg.role !== 'user') continue;
    const msgIdx = allMessages.findIndex(m => m.id === msg.id);
    const nextAssistant = allMessages.slice(msgIdx + 1)
      .find(m => m.role === 'assistant' && m.agentId === msg.agentId);
    if (nextAssistant && !selectedIds.has(nextAssistant.id)) {
      toAdd.push(nextAssistant);
      selectedIds.add(nextAssistant.id);
    }
  }

  if (!toAdd.length) return selectedMessages;
  return [...selectedMessages, ...toAdd].sort((a, b) => a.timestamp - b.timestamp);
}

// ─── Prompt Assembler ─────────────────────────────────────────────────────────

function assemblePrompt({
  currentInput,
  agentId = 'brain',
  systemPrompt = '',
  tokenBudget = MEMORY_CONSTANTS.DEFAULT_TOKEN_BUDGET,
}) {
  const maxChars = tokenBudget * MEMORY_CONSTANTS.CHARS_PER_TOKEN;
  const keywords = extractKeywords(currentInput);

  const agentHistory = history.filter(m => m.agentId === agentId && m.role !== 'system');

  // Prune tool results in-memory before scoring
  const prunedHistory = agentHistory.map(m => {
    if (m.role === 'tool') return { ...m, content: pruneContent(m.content) };
    return m;
  });

  const scored = prunedHistory.map((msg, i) => ({
    ...msg,
    _score: scoreMessage(msg, keywords, i, prunedHistory.length),
  }));

  const selected = selectMessagesWithHeadTail(
    scored, maxChars, systemPrompt.length, currentInput.length
  );
  const complete = ensureTurnCompleteness(selected, prunedHistory);

  const context = complete.map(m => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.content,
  }));

  const usedChars = systemPrompt.length + currentInput.length +
    complete.reduce((a, m) => a + m.content.length + MEMORY_CONSTANTS.MESSAGE_OVERHEAD_CHARS, 0) +
    MEMORY_CONSTANTS.PROMPT_OVERHEAD_CHARS;

  const estimatedTokens = Math.round(usedChars / MEMORY_CONSTANTS.CHARS_PER_TOKEN);
  const utilizationPct  = Math.round((estimatedTokens / tokenBudget) * 100);

  return {
    systemPrompt,
    context,
    currentInput,
    stats: {
      totalMessages: agentHistory.length,
      selectedMessages: complete.length,
      droppedMessages: agentHistory.length - complete.length,
      estimatedTokens,
      tokenBudget,
      utilizationPct,
      health: utilizationPct >= 90 ? 'critical'
        : utilizationPct >= 75 ? 'warning'
        : utilizationPct >= 50 ? 'ok'
        : 'good',
      shouldCompact: agentHistory.length > AUTO_COMPACT_THRESHOLD,
      keywords: keywords.slice(0, MEMORY_CONSTANTS.KEYWORD_STATS_LIMIT),
    },
  };
}

// ─── Context health ───────────────────────────────────────────────────────────

function getContextHealth(agentId = 'brain', tokenBudget = MEMORY_CONSTANTS.DEFAULT_TOKEN_BUDGET) {
  const agentHistory = history.filter(m => m.agentId === agentId);
  const estimatedChars = agentHistory.reduce((a, m) => a + m.content.length, 0);
  const estimatedTokens = Math.round(estimatedChars / MEMORY_CONSTANTS.CHARS_PER_TOKEN);
  const utilizationPct  = Math.min(Math.round((estimatedTokens / tokenBudget) * 100), 100);

  return {
    messageCount: agentHistory.length,
    estimatedTokens,
    utilizationPct,
    health: utilizationPct >= 90 ? 'critical'
      : utilizationPct >= 75 ? 'warning'
      : utilizationPct >= 50 ? 'ok'
      : 'good',
    shouldCompact: agentHistory.length > AUTO_COMPACT_THRESHOLD,
    autoCompactThreshold: AUTO_COMPACT_THRESHOLD,
  };
}

// ─── Store summary ────────────────────────────────────────────────────────────

function storeSummary(agentId, summaryText, coveredIds) {
  const entry = {
    id: Date.now().toString(36),
    agentId, summary: summaryText,
    coveredIds, timestamp: Date.now(),
  };
  summaries.push(entry);
  history = history.filter(m => !coveredIds.includes(m.id));

  // ✅ Fix: async IIFE pattern
  (async () => {
    try {
      await db.from('summaries').insert({
        id: entry.id, agent_id: entry.agentId, summary: entry.summary,
        covered_ids: entry.coveredIds, timestamp: entry.timestamp,
      });
      if (coveredIds.length) {
        await db.from('messages').delete().in('id', coveredIds);
      }
    } catch (e) {
      console.warn(`[memory] Failed to persist summary: ${e.message}`);
    }
  })();
}

// ─── Clear history ────────────────────────────────────────────────────────────

function clearHistory(agentId = null) {
  if (agentId) {
    const ids = history.filter(m => m.agentId === agentId).map(m => m.id);
    history = history.filter(m => m.agentId !== agentId);

    // ✅ Fix: async IIFE instead of .catch() chained on Supabase query
    if (ids.length) {
      (async () => {
        try {
          await db.from('messages').delete().in('id', ids);
        } catch (e) {
          console.warn(`[memory] clearHistory failed for ${agentId}: ${e.message}`);
        }
      })();
    }
  } else {
    history = [];
    (async () => {
      try {
        await db.from('messages').delete().neq('id', '');
      } catch (e) {
        console.warn(`[memory] clearHistory (global) failed: ${e.message}`);
      }
    })();
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  init: load,
  store,
  assemblePrompt,
  storeSummary,
  clearHistory,
  getContextHealth,
  autoCompactIfNeeded,
  getHistory: (agentId = null, limit = MEMORY_CONSTANTS.DEFAULT_HISTORY_LIMIT) => {
    const safeLimit = limit || MEMORY_CONSTANTS.DEFAULT_HISTORY_LIMIT;
    const h = agentId ? history.filter(m => m.agentId === agentId) : history;
    return h.slice(-safeLimit);
  },
  getSummaries: () => summaries,
};