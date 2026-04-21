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
let routingMap = {};

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
  if (data.telegramRouting) {
    try { routingMap = JSON.parse(data.telegramRouting); } catch {}
  }
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

async function sendReminderMessage(chatId, taskText, reminderId) {
  if (!bot) return;
  // Fallback to configured owner if chatId is 'owner' or undefined
  const targetId = (chatId && chatId !== 'owner') ? chatId : config.telegramOwnerChatId;
  if (!targetId) {
    logger.warn('telegram', 'Cannot send reminder: No target chat ID available.');
    return;
  }

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Đã làm xong', callback_data: `reminder_done_${reminderId}` },
          { text: '⏳ Để sau (10p)', callback_data: `reminder_delay_${reminderId}` }
        ]
      ]
    }
  };

  const text = `🔔 Nhắc nhở: ${taskText}`;
  try {
    await bot.sendMessage(targetId, text, opts);
    logger.info('telegram', `Sent reminder: ${taskText} to ${targetId}`);
  } catch (err) {
    logger.warn('telegram', `Failed to send reminder: ${err.message}`);
  }
}

async function triggerAgentReminder(chatId, taskText, reminderId) {
  if (!bot) return;
  const targetId = (chatId && chatId !== 'owner') ? chatId : config.telegramOwnerChatId;
  if (!targetId) return;

  const routedAgentId = routingMap[targetId];
  const agentsModule = require('./agents');

  if (routedAgentId && agentsModule.getById(routedAgentId)) {
    const prompt = `[Hệ thống kích hoạt Báo thức]: Đã đến giờ nhắc nhở người dùng thực hiện nhiệm vụ: "${taskText}". Bạn hãy lập tức đóng vai giáo viên/trợ thủ, dựa vào lịch sử chat để soạn một bài học, bài tập hoặc thông tin kiến thức liên quan đến nhiệm vụ này gửi cho người dùng ngay nhé! Thêm lời nhắc nhở họ làm bài.`;

    let fullResponse = '';
    bot.sendChatAction(targetId, 'typing').catch(() => {});

    agentsModule.runAgent({
      agentId: routedAgentId,
      userInput: prompt,
      memoryId: `tg-${targetId}`,
      onToken: (token) => { fullResponse += token; },
      onDone: (content) => {
        const reply = content || fullResponse;
        if (!reply.trim()) return;

        bot.sendMessage(targetId, reply, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Đã hoàn thành', callback_data: `reminder_done_${reminderId}` },
                { text: '⏳ Để sau (10p)', callback_data: `reminder_delay_${reminderId}` }
              ]
            ]
          }
        }).catch(e => logger.warn('telegram', `Failed agent reminder send: ${e.message}`));
      },
      onError: (e) => {
        logger.error('telegram', `Agent reminder error: ${e.message}`);
        bot.sendMessage(targetId, `⚠️ Báo thức: ${taskText} (Lỗi AI: ${e.message})`).catch(()=>{});
      }
    });

  } else {
    // Không có agent định tuyến -> Dùng lệnh nhắc nhở thông thường
    sendReminderMessage(targetId, taskText, reminderId);
  }
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

    const agentsModule = require('./agents');

    // ── Lệnh Slash Commands ──
    if (text.startsWith('/listagents')) {
      const allAgents = agentsModule.getAll();
      const textList = allAgents.map(a => `- \`${a.id}\`: ${a.name}`).join('\n');
      return bot.sendMessage(chatId, `Danh sách Agents:\n${textList}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }

    if (text.startsWith('/setagent ')) {
      const isOwner = String(msg.from?.id) === config.telegramOwnerChatId || chatId === config.telegramOwnerChatId;
      if (!isOwner) {
        return bot.sendMessage(chatId, '❌ Chỉ Chủ sở hữu mới có quyền gắn Agent!').catch(()=>{});
      }
      const targetAgentId = text.split(' ')[1];
      if (!agentsModule.getById(targetAgentId)) {
        return bot.sendMessage(chatId, `❌ Không tìm thấy Agent ID: ${targetAgentId}`).catch(()=>{});
      }
      routingMap[chatId] = targetAgentId;
      saveConfig({ telegramRouting: JSON.stringify(routingMap) });
      return bot.sendMessage(chatId, `✅ Đã gán thành công phòng chat này cho Agent: ${targetAgentId}`).catch(()=>{});
    }

    if (text === '/resetagent') {
      const isOwner = String(msg.from?.id) === config.telegramOwnerChatId || chatId === config.telegramOwnerChatId;
      if (!isOwner) return bot.sendMessage(chatId, '❌ Chỉ Chủ sở hữu mới có quyền!').catch(()=>{});
      delete routingMap[chatId];
      saveConfig({ telegramRouting: JSON.stringify(routingMap) });
      return bot.sendMessage(chatId, `✅ Đã gỡ bỏ Agent! Phòng chat này trở lại quyền của Brain OS mặc định.`).catch(()=>{});
    }

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
    const memoryId = `tg-${chatId}`;

    bot.sendChatAction(chatId, 'typing').catch(() => {});

    let fullResponse = '';

    const onToken = (token) => { fullResponse += token; };
    const onDone = (content) => {
      pendingChats.delete(chatId);
      const reply = content || fullResponse;
      if (!reply.trim()) return;

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

      broadcastMessage({
        id: Date.now(),
        direction: 'out',
        from: 'Brain',
        to: senderName,
        chatId,
        text: reply.slice(0, TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH) + (reply.length > TELEGRAM_CONSTANTS.MESSAGE_PREVIEW_LENGTH ? '…' : ''),
        timestamp: new Date().toISOString(),
      });
    };
    const onError = (e) => {
      pendingChats.delete(chatId);
      logger.error('telegram', `Chat error for ${chatId}: ${e.message}`);
      bot.sendMessage(chatId, `⚠️ Lỗi: ${e.message}`).catch(() => {});
    };

    const isSummoningBrain = text.toLowerCase().startsWith('@brain ') || text.toLowerCase().startsWith('/brain ');
    const cleanedText = isSummoningBrain ? text.replace(/^@brain\s+|^\/brain\s+/i, '').trim() : text;
    
    // Inject hidden chat_id and user_info context so the agent knows where to schedule tools and who is talking
    const userInfo = JSON.stringify({
      id: msg.from.id,
      username: msg.from.username,
      first_name: msg.from.first_name,
      last_name: msg.from.last_name
    });
    const inputPrompt = `[System Context: Target Chat ID = ${chatId}, User Info = ${userInfo}]\nUser: ${cleanedText}`;

    const routedAgentId = routingMap[chatId];
    if (routedAgentId && agentsModule.getById(routedAgentId) && !isSummoningBrain) {
      // Gọi trực tiếp Agent cụ thể
      agentsModule.runAgent({
        agentId: routedAgentId,
        userInput: inputPrompt,
        memoryId,
        onToken, onDone, onError
      });
    } else {
      // Mặc định gọi Brain orchestrator
      brain.chat({
        userInput: inputPrompt,
        agentId: memoryId,
        onToken, onDone, onError
      });
    }
  });
// (removed due to refactoring above)

  bot.on('polling_error', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes(TELEGRAM_CONSTANTS.POLLING_CONFLICT_CODE)) { logger.debug('telegram', '409 — skipping'); return; }
    logger.warn('telegram', `Polling: ${msg}`);
  });

  bot.on('callback_query', async (query) => {
    try {
      const action = query.data;
      const msg = query.message;

      // Prevent redundant clicks
      if (msg.text.includes('✅ Đã hoàn thành') || msg.text.includes('⏳ Đã hoãn')) {
        await bot.answerCallbackQuery(query.id, { text: 'Nhiệm vụ này đã được xử lý rồi!' });
        return;
      }

      if (action.startsWith('reminder_done_')) {
        const id = action.replace('reminder_done_', '');
        await bot.answerCallbackQuery(query.id, { text: 'Tuyệt vời! Bạn đã hoàn thành nhiệm vụ.' });
        await bot.editMessageText(msg.text + '\n\n✅ Đã hoàn thành!', {
          chat_id: msg.chat.id,
          message_id: msg.message_id
        });
      } else if (action.startsWith('reminder_delay_')) {
        const id = action.replace('reminder_delay_', '');
        await bot.answerCallbackQuery(query.id, { text: 'Nhắc lại sau 10 phút.' });
        await bot.editMessageText(msg.text + '\n\n⏳ Đã hoãn lại 10 phút.', {
          chat_id: msg.chat.id,
          message_id: msg.message_id
        });
      }
    } catch (err) {
      logger.warn('telegram', `Lỗi xử lý callback query: ${err.message}`);
    }
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
  if (config.telegramRouting) {
    try { routingMap = JSON.parse(config.telegramRouting); } catch {}
  }
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
  getStatus, sendToOwner, setOwnerChatId, sendReminderMessage, triggerAgentReminder,
  getMessages: () => messageLog,
  registerClient: (ws) => wsClients.add(ws),
  removeClient: (ws) => wsClients.delete(ws),
};