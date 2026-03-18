/**
 * tools/executor.js — Dispatches tool calls to their implementations
 */

const logger = require('../logger');
const { TOOL_CONSTANTS } = require('../constants');

const TOOL_MODULES = {
  // System
  get_current_time: () => require('./system').get_current_time,
  get_system_status: () => require('./system').get_system_status,
  get_memory_stats: () => require('./system').get_memory_stats,

  // Agents
  list_agents: () => require('./agents').list_agents,
  call_agent: () => require('./agents').call_agent,
  manage_agent: () => require('./agents').manage_agent,
  run_pipeline: () => require('./agents').run_pipeline,
  create_agent: () => require('./agents').create_agent,
  update_agent: () => require('./agents').update_agent,

  // Shell
  run_command: () => require('./shell').run_command,

  // Files
  read_file: () => require('./files').read_file,
  write_file: () => require('./files').write_file,

  // Network
  http_request: () => require('./network').http_request,
  search_web: () => require('./network').search_web,

  // Browser
  browse_web: () => require('./browser').browse_web,
  browse_search: () => require('./browser').browse_search,

  // Memory / Learning
  save_lesson: () => require('./memory').save_lesson,
  get_lessons: () => require('./memory').get_lessons,
  resolve_lesson: () => require('./memory').resolve_lesson,

  // Telegram
  send_telegram: () => require('./telegram').send_telegram,

  // Skills
  import_skill: () => require('./skills').import_skill,

  // MCP
  list_mcp_servers: () => require('./mcp').list_mcp_servers,
  create_mcp_server: () => require('./mcp').create_mcp_server,
  mcp_connect: () => require('./mcp').mcp_connect,
  mcp_call: () => require('./mcp').mcp_call,
};

async function executeTool(toolCall) {
  const name = toolCall.function?.name;
  const rawArgs = toolCall.function?.arguments || {};
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

  const getImpl = TOOL_MODULES[name];
  if (!getImpl) {
    logger.warn('tools', `Unknown tool: ${name}`);
    return { error: `Unknown tool: "${name}". Available: ${Object.keys(TOOL_MODULES).join(', ')}` };
  }

  const impl = getImpl();

  try {
    const preview = JSON.stringify(args).slice(0, TOOL_CONSTANTS.TOOL_LOG_ARGS_PREVIEW_LENGTH);
    logger.debug('tools', `🔧 ${name}(${preview})`);

    const result = await impl(args);

    const resultPreview = JSON.stringify(result).slice(0, TOOL_CONSTANTS.TOOL_LOG_RESULT_PREVIEW_LENGTH);
    logger.debug('tools', `✅ ${name} → ${resultPreview}`);

    return result;
  } catch (e) {
    logger.error('tools', `❌ ${name} failed: ${e.message}`);
    return { error: `Tool "${name}" failed: ${e.message}` };
  }
}

async function executeToolsParallel(toolCalls) {
  return Promise.all(toolCalls.map(tc => executeTool(tc)));
}

module.exports = { executeTool, executeToolsParallel };