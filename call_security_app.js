const mcp = require('./backend/src/mcp-manager');

async function run() {
  await mcp.init();
  
  const server = mcp.create({
    name: 'SecurityApp',
    type: 'stdio',
    url: `py ${process.env.SECURITY_APP_PATH}`,
    description: 'User Python MCP Server'
  });

  console.log('Calling SecurityApp.get_system_config...');
  try {
    const res = await mcp.callTool({
      serverName: 'SecurityApp',
      toolName: 'get_system_config',
      args: {}
    });
    console.log('\n--- KẾT QUẢ TỪ TOOL SECURITYAPP ---');
    console.log(JSON.stringify(res, null, 2));
    console.log('--- ----------------------------- ---');

  } catch (err) {
    console.error('Call Failed:', err);
  }

  // Cleanup
  await mcp.disconnect(server.id);
  process.exit(0);
}

run().catch(err => {
  console.error('Run Failed:', err);
  process.exit(1);
});
