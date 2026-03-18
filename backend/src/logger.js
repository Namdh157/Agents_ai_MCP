const db = require('./db');
const { APP_CONSTANTS, LOGGER_CONSTANTS } = require('./constants');

let logs = [];
let wsClients = new Set();

async function loadLogs() {
  const { data, error } = await db.from('logs').select('*').order('timestamp', { ascending: false }).limit(LOGGER_CONSTANTS.MAX_LOGS);
  if (error) throw new Error(`[logger] Failed to load logs: ${error.message}`);
  logs = data ? data.reverse() : [];
}

function saveLog(entry) {
  (async () => {
    try {
      await db.from('logs').insert({
        id: entry.id,
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        message: entry.message,
        data: entry.data || null,
      });
    } catch {
      // fire-and-forget
    }
  })();
}

function log(level, source, message, data = null) {
  const entry = {
    id: Date.now() + Math.random().toString(36).slice(2, 2 + LOGGER_CONSTANTS.RANDOM_ID_SUFFIX_LENGTH),
    timestamp: new Date().toISOString(),
    level,    // info | warn | error | debug
    source,   // brain | agent:{name} | telegram | system
    message,
    data
  };

  logs.push(entry);
  if (logs.length > LOGGER_CONSTANTS.MAX_LOGS) logs.shift();
  saveLog(entry);

  // Broadcast to all connected WS clients
  const payload = JSON.stringify({ type: 'log', entry });
  for (const client of wsClients) {
    try { client.send(payload); } catch {}
  }

  // Console output with color
  const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' };
  const reset = '\x1b[0m';
  const c = colors[level] || '';
  console.log(`${c}[${level.toUpperCase()}] [${source}]${reset} ${message}`);

  return entry;
}

module.exports = {
  init: loadLogs,
  registerClient: (ws) => wsClients.add(ws),
  removeClient: (ws) => wsClients.delete(ws),
  getLogs: (limit = APP_CONSTANTS.DEFAULT_LOGS_API_LIMIT, levelFilter = null) => {
    let result = logs;
    if (levelFilter) result = result.filter(l => l.level === levelFilter);
    return result.slice(-limit);
  },
  clearLogs: () => {
    logs = [];
    (async () => {
      try {
        await db.from('logs').delete().neq('id', '');
      } catch {}
    })();
  },
  info:  (source, msg, data) => log('info',  source, msg, data),
  warn:  (source, msg, data) => log('warn',  source, msg, data),
  error: (source, msg, data) => log('error', source, msg, data),
  debug: (source, msg, data) => log('debug', source, msg, data),
};
