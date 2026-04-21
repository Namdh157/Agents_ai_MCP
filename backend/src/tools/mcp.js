/**
 * tools/mcp.js — MCP tools for Brain
 */

async function list_mcp_servers() {
  const mcp = require('../mcp-manager');
  const all = mcp.getAll();

  // Auto-reconnect servers with 0 tools to refresh discovery
  for (const s of all) {
    if (s.connected && s.toolCount === 0) {
      try {
        await mcp.connect(s.id);
      } catch { /* ignore */ }
    }
  }

  const refreshed = mcp.getAll();
  return {
    total: refreshed.length,
    connected: refreshed.filter(s => s.connected).length,
    servers: refreshed.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      connected: s.connected,
      enabled: s.enabled,
      toolCount: s.toolCount || 0,
      tools: s.tools || [],
    })),
    instruction: refreshed.some(s => s.tools?.length > 0)
      ? 'Use EXACT tool names listed above in mcp_call. Do NOT guess tool names.'
      : 'No tools discovered yet. Use mcp_connect to connect a server.',
  };
}

async function create_mcp_server({ name, url, authType = 'bearer', authToken = '', description = '', type = 'custom' }) {
  const mcp = require('../mcp-manager');

  if (!name || !url) return { error: 'name and url are required' };

  const existing = mcp.getByName(name);
  if (existing) {
    return {
      ok: true,
      already_exists: true,
      id: existing.id,
      name: existing.name,
      connected: existing.connected,
      tools: existing.tools || [],
      message: `Server "${name}" already exists. Use mcp_connect to refresh its tool list.`,
    };
  }

  const server = mcp.create({ name, url, authType, authToken, description, type, enabled: true });
  
  let nextStep = `Server "${server.name}" created. Call mcp_connect next to discover its tools.`;
  if (type === 'stdio') {
    nextStep = `Stdio server "${server.name}" created. Ensure "py" or "python" is in your PATH. Call mcp_connect now.`;
  }

  return {
    ok: true,
    id: server.id,
    name: server.name,
    url: server.url,
    message: nextStep,
  };
}

async function mcp_connect({ server_id, server_name }) {
  const mcp = require('../mcp-manager');

  const srv = server_id
    ? mcp.getById(server_id)
    : mcp.getByName(server_name || '');

  if (!srv) {
    return { error: `Server not found: "${server_id || server_name}". Use create_mcp_server to add it first.` };
  }

  try {
    const result = await mcp.connect(srv.id);
    return {
      ok: true,
      server: srv.name,
      connected: result.connected,
      toolCount: result.toolCount,
      tools: result.tools,
      // Make tool names very explicit for Brain
      available_tools: result.tools.length > 0
        ? `Available tools (use EXACTLY these names): ${result.tools.join(', ')}`
        : 'No tools returned — check token permissions',
    };
  } catch (e) {
    return { error: `Connect failed: ${e.message}` };
  }
}

async function mcp_call({ server, tool, args = {} }) {
  const mcp = require('../mcp-manager');

  // Verify tool exists before calling
  const srv = mcp.getByName(server);
  if (srv && srv.tools?.length > 0 && !srv.tools.includes(tool)) {
    return {
      error: `Tool "${tool}" not found on "${server}".`,
      available_tools: srv.tools,
      hint: `Use one of: ${srv.tools.join(', ')}`,
    };
  }

  return mcp.callTool({ serverName: server, toolName: tool, args });
}

module.exports = { list_mcp_servers, create_mcp_server, mcp_connect, mcp_call };