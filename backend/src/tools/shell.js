/**
 * tools/shell.js — Shell execution tool
 *   - run_command (read-only whitelist)
 */

const { execSync } = require('child_process');
const { TOOL_CONSTANTS } = require('../constants');

// Read-only safe command prefixes
const SAFE_PREFIXES = [
  'dir', 'ls', 'echo', 'type', 'cat', 'hostname', 'whoami',
  'date', 'time', 'systeminfo', 'tasklist', 'ipconfig',
  'node -v', 'node --version', 'npm -v', 'npm list',
  'git status', 'git log', 'git branch', 'git diff',
  'powershell -c get-date', 'powershell -c get-process',
  'wmic', 'net time', 'ping', 'nslookup',
  'df', 'free', 'top -bn1', 'ps aux', 'uname', 'which',
];

async function run_command({ command }) {
  const cmd = (command || '').trim();
  const isAllowed = SAFE_PREFIXES.some(p => cmd.toLowerCase().startsWith(p.toLowerCase()));

  if (!isAllowed) {
    return {
      error: `Command blocked: "${cmd}". Only read-only commands allowed.`,
      allowed_prefixes: SAFE_PREFIXES.slice(0, 10).join(', ') + '...',
      blocked: true,
    };
  }

  try {
    const output = execSync(cmd, {
      timeout: TOOL_CONSTANTS.COMMAND_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: TOOL_CONSTANTS.COMMAND_MAX_BUFFER_BYTES,
    });
    return { output: output.slice(0, TOOL_CONSTANTS.COMMAND_OUTPUT_PREVIEW_LENGTH), command: cmd };
  } catch (e) {
    return { error: e.message.slice(0, TOOL_CONSTANTS.ERROR_OUTPUT_PREVIEW_LENGTH), command: cmd };
  }
}

module.exports = { run_command };