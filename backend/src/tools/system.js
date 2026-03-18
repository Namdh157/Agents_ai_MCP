/**
 * tools/system.js — System information tools
 */

const os = require('os');

async function get_current_time() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    date: now.toLocaleDateString('vi-VN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }),
    time: now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
    timestamp: Date.now(),
    timezone: 'Asia/Ho_Chi_Minh (UTC+7)',
  };
}

async function get_system_status() {
  const memory = require('../memory');
  const agents = require('../agents');
  const brain = require('../brain');
  const { getBrowserStatus } = require('./browser');

  const brainConfig = brain.getConfig();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const browserStatus = await getBrowserStatus();

  return {
    server_uptime: Math.round(process.uptime()) + 's',
    platform: `${os.platform()} ${os.release()}`,
    hostname: os.hostname(),
    cpu_cores: os.cpus().length,
    cpu_model: os.cpus()[0]?.model?.slice(0, 40) || 'unknown',
    ram_total: Math.round(totalMem / 1024 / 1024) + 'MB',
    ram_used: Math.round((totalMem - freeMem) / 1024 / 1024) + 'MB',
    ram_free: Math.round(freeMem / 1024 / 1024) + 'MB',
    brain_model: brainConfig.model,
    brain_available: brainConfig.available,
    search_backend: process.env.BRAVE_API_KEY
      ? 'Brave Search'
      : process.env.TAVILY_API_KEY
        ? 'Tavily'
        : 'DuckDuckGo (HTML)',
    browser_available: browserStatus.available,
    browser_install: browserStatus.available ? null : browserStatus.install_cmd,
    memory_messages: memory.getHistory().length,
    active_agents: agents.getAll().filter(a => a.active).length,
    node_version: process.version,
  };
}

async function get_memory_stats() {
  const memory = require('../memory');
  const history = memory.getHistory();
  const agentIds = [...new Set(history.map(m => m.agentId).filter(Boolean))];

  return {
    total_messages: history.length,
    brain_messages: history.filter(m => m.agentId === 'brain' || !m.agentId).length,
    agent_messages: history.filter(m => m.agentId && m.agentId !== 'brain').length,
    active_agent_contexts: agentIds.length,
    agent_context_breakdown: agentIds.map(id => ({
      id,
      messages: history.filter(m => m.agentId === id).length,
    })),
  };
}

module.exports = { get_current_time, get_system_status, get_memory_stats };