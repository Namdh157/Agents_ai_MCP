/**
 * telegram.js — Telegram bot integration
 *
 * Per-chat context: mỗi chatId có agentId riêng = 'tg-{chatId}'
 * → context không bị lẫn với web chat hoặc các chat telegram khác
 *
 * Orchestrator: dùng brain.chat() giống hệt web chat
 * Sender name: hiển thị đúng username/first_name từ Telegram
 */

const db = require('./db');
const logger = require('./logger');
const { TELEGRAM_CONSTANTS } = require('./constants');

let bot = null;
let botInfo = null;
let messageLog = [];
let wsClients = new Set();
let config = {};
let brain = null;

// Track pending requests per chat để tránh double-reply
const pendingChats = new Set();

async function loadConfig() {
  const { data, error } = await db.from('config').select('*');
  if (error) throw new Error(`[telegram] Config load failed: ${error.message}`);
  config = {};
  (data || []).forEach(r => { config[r.key] = r.value; });
}

function saveConfig(data) {
  config = { ...config, ...data };
  const rows = Object.entries(data).map(([key, value]) => ({ key, value: String(value) }));
  (async () => {
    try {
      await db.from('config').upsert(rows);
    } catch (err) {
      logger.warn('telegram', `Config persist failed: ${err.message}`);
    }
  })();
}

function broadcast(payload) {
  const str = JSON.stringify(payload);
  for (const ws of wsClients) { try { ws.send(str); } catch {} }
}

function broadcastMessage(msg) {
  messageLog.unshift(msg);
  if (messageLog.length > TELEGRAM_CONSTANTS.MESSAGE_LOG_LIMIT) messageLog.pop();
  broadcast({ type: 'telegram_message', message: msg });
}

// ── Proactive: gửi tin cho owner ──────────────────────────────────────────────

async function sendToOwner(text) {
  if (!bot) throw new Error('Bot chưa kết nối');
  const chatId = config.telegramOwnerChatId;
  if (!chatId) throw new Error('Chưa có owner chat ID');

  const chunks = [];
  for (let i = 0; i < text.length; i += TELEGRAM_CONSTANTS.MESSAGE_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + TELEGRAM_CONSTANTS.MESSAGE_CHUNK_SIZE));
  }
  for (const chunk of chunks) await bot.sendMessage(chatId, chunk);

  const logEntry = {
    id: Date.now(),
    direction: 'out',
    from: 'Brain',
    to: 'owner',
    chatId,
    text: text.slice(0, TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH) + (text.length > TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH ? '…' : ''),
    timestamp: new Date().toISOString(),
    proactive: true,
  };
  broadcastMessage(logEntry);
  logger.info('telegram', `→ owner: ${text.slice(0, TELEGRAM_CONSTANTS.LOG_PREVIEW_LENGTH)}`);
  return { ok: true, chatId, length: text.length };
}

function setOwnerChatId(chatId) {
  saveConfig({ telegramOwnerChatId: String(chatId) });
  broadcast({ type: 'telegram_status', status: getStatus() });
  logger.info('telegram', `Owner chat ID set: ${chatId}`);
}

// ── Connect ───────────────────────────────────────────────────────────────────

async function connect(token) {
  if (bot) {
    try { await bot.stopPolling(); } catch {}
    bot = null;
    botInfo = null;
  }

  const TelegramBot = require('node-telegram-bot-api');
  const newBot = new TelegramBot(token, { polling: true });

  try {
    botInfo = await newBot.getMe();
  } catch (e) {
    try { await newBot.stopPolling(); } catch {}
    throw new Error(`Không kết nối được: ${e?.message || e}`);
  }

  bot = newBot;
  saveConfig({ telegramToken: token, telegramBotUsername: botInfo.username });
  logger.info('telegram', `Connected: @${botInfo.username}`);
  broadcast({ type: 'telegram_status', status: getStatus() });

  bot.on('message', async (msg) => {
    const chatId = String(msg.chat.id);
    const text = msg.text;
    if (!text) return;

    // Build display name for sender
    const from = msg.from;
    const senderName = from.username
      ? `@${from.username}`
      : [from.first_name, from.last_name].filter(Boolean).join(' ') || String(from.id);

    // Auto-detect owner on first message
    if (!config.telegramOwnerChatId) {
      saveConfig({ telegramOwnerChatId: chatId });
      broadcast({ type: 'telegram_status', status: getStatus() });
      logger.info('telegram', `Auto-detected owner: ${chatId} (${senderName})`);
      bot.sendMessage(chatId, `✅ Chat ID (${chatId}) đã lưu. Brain OS sẵn sàng.`).catch(() => {});
    }

    // Log incoming to UI
    broadcastMessage({
      id: msg.message_id,
      direction: 'in',
      from: senderName,
      chatId,
      text,
      timestamp: new Date().toISOString(),
    });
    logger.info('telegram', `${senderName} [${chatId}]: ${text.slice(0, TELEGRAM_CONSTANTS.LOG_PREVIEW_LENGTH)}`);

    if (!brain) return;

    // Guard: skip if this chat already has a pending reply
    if (pendingChats.has(chatId)) {
      bot.sendMessage(chatId, '⏳ Đang xử lý tin trước, vui lòng chờ…').catch(() => {});
      return;
    }
    pendingChats.add(chatId);

    // Each chatId gets its own memory context
    // Format: tg-{chatId} → isolated from web chat ('brain') and other telegram chats
    const agentId = `tg-${chatId}`;

    bot.sendChatAction(chatId, 'typing').catch(() => {});

    let fullResponse = '';

    brain.chat({
      userInput: text,
      agentId,                    // ← per-chat isolated context
      onToken: (token) => {
        fullResponse += token;
      },
      onDone: (content) => {
        pendingChats.delete(chatId);
        const reply = content || fullResponse;
        if (!reply.trim()) return;

        // Split long messages
        const chunks = [];
        for (let i = 0; i < reply.length; i += TELEGRAM_CONSTANTS.MESSAGE_CHUNK_SIZE) {
          chunks.push(reply.slice(i, i + TELEGRAM_CONSTANTS.MESSAGE_CHUNK_SIZE));
        }

        (async () => {
          for (const chunk of chunks) {
            await bot.sendMessage(chatId, chunk).catch(e =>
              logger.warn('telegram', `Send error: ${e.message}`)
            );
          }
        })();

        // Log outgoing to UI
        broadcastMessage({
          id: Date.now(),
          direction: 'out',
          from: 'Brain',
          to: senderName,
          chatId,
          text: reply.slice(0, TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH) + (reply.length > TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH ? '…' : ''),
          timestamp: new Date().toISOString(),
        });
      },
      onError: (e) => {
        pendingChats.delete(chatId);
        logger.error('telegram', `Chat error for ${chatId}: ${e.message}`);
        bot.sendMessage(chatId, `⚠️ Lỗi: ${e.message}`).catch(() => {});
      },
    });
  });

  bot.on('polling_error', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes(TELEGRAM_CONSTANTS.POLLING_CONFLICT_CODE)) { logger.debug('telegram', '409 — skipping'); return; }
    logger.warn('telegram', `Polling: ${msg}`);
  });

  return botInfo;
}

async function disconnect() {
  if (!bot) return;
  try { await bot.stopPolling(); } catch {}
  bot = null;
  botInfo = null;
  pendingChats.clear();
  logger.info('telegram', 'Disconnected');
  broadcast({ type: 'telegram_status', status: getStatus() });
}

function getStatus() {
  return {
    connected: !!bot,
    username: botInfo?.username || null,
    savedToken: config.telegramToken || null,
    ownerChatId: config.telegramOwnerChatId || null,
    messageCount: messageLog.length,
  };
}

async function init(brainModule) {
  brain = brainModule;
  await loadConfig();
  if (config.telegramToken) {
    setTimeout(() => {
      connect(config.telegramToken).catch(e =>
        logger.warn('telegram', `Auto-reconnect failed: ${e.message}`)
      );
    }, TELEGRAM_CONSTANTS.AUTORECONNECT_DELAY_MS);
  }
}

module.exports = {
  init, connect, disconnect,
  getStatus, sendToOwner, setOwnerChatId,
  getMessages: () => messageLog,
  registerClient: (ws) => wsClients.add(ws),
  removeClient: (ws) => wsClients.delete(ws),
};