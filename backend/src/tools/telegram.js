/**
 * tools/telegram.js — Telegram integration tool
 *   - send_telegram
 */

const { TOOL_CONSTANTS } = require('../constants');

async function send_telegram({ message }) {
const telegram = require('../telegram');
  const status = telegram.getStatus();
  if (!status.connected) return { error: 'Telegram bot not connected.' };
  if (!status.ownerChatId) return { error: 'No owner chat ID set.' };

  try {
    const result = await telegram.sendToOwner(message);
    return {
      sent: true,
      chatId: result.chatId,
      preview: message.slice(0, TOOL_CONSTANTS.TELEGRAM_PREVIEW_LENGTH),
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { send_telegram };