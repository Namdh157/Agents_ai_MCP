/**
 * tools/index.js — Public entry point for the tools module
 *
 * Structure:
 *   tools/
 *     index.js       ← you are here (re-exports)
 *     definitions.js ← all TOOL_DEFINITIONS schemas
 *     executor.js    ← executeTool + executeToolsParallel
 *     system.js      ← get_current_time, get_system_status, get_memory_stats
 *     agents.js      ← list_agents, call_agent, manage_agent, run_pipeline, create_agent, update_agent
 *     shell.js       ← run_command
 *     files.js       ← read_file, write_file
 *     network.js     ← http_request, search_web
 *     memory.js      ← save_lesson
 *     telegram.js    ← send_telegram
 *     skills.js      ← import_skill + ClawHub fetch helpers
 */

const { TOOL_DEFINITIONS } = require('./definitions');
const { executeTool, executeToolsParallel } = require('./executor');

module.exports = {
  TOOL_DEFINITIONS,
  executeTool,
  executeToolsParallel,
  getToolNames: () => TOOL_DEFINITIONS.map(t => t.function.name),
};