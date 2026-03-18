/**
 * tools/definitions.js — All TOOL_DEFINITIONS schemas
 */

const { TELEGRAM_CONSTANTS, TOOL_CONSTANTS } = require('../constants');

const TOOL_DEFINITIONS = [
  // ── System ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date, time, and day of week in Vietnam timezone (UTC+7).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Get system status: uptime, memory, CPU, brain model, active agents, search backend, browser availability.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_memory_stats',
      description: 'Get conversation memory statistics broken down per agent.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Agents ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'List all AI agents with their status, provider, model, and skills count.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_agent',
      description: 'Delegate a task to a specialized agent. Always call list_agents first to verify agent IDs.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Agent ID (verify with list_agents first)' },
          task: { type: 'string', description: 'Task to send to the agent' },
        },
        required: ['agent_id', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_agent',
      description: 'Enable or disable an agent.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string' },
          action: { type: 'string', enum: ['enable', 'disable'] },
        },
        required: ['agent_id', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_pipeline',
      description: 'Run multiple agent tasks. Use "parallel" for simultaneous execution, "sequential" to chain outputs ({step_0}, {step_1}...).',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['parallel', 'sequential'] },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent_id: { type: 'string' },
                task: { type: 'string' },
              },
              required: ['agent_id', 'task'],
            },
          },
        },
        required: ['mode', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_agent',
      description: 'Create a new AI agent. All skills MUST be written in English.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          provider: { type: 'string', enum: ['copilot', 'claude', 'gemini', 'openrouter', 'openai'] },
          model: { type: 'string', description: 'e.g. gpt-5-mini, claude-sonnet-4-5' },
          systemPrompt: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Instructions in English' },
          apiKey: { type: 'string', description: 'Leave empty to use env var' },
        },
        required: ['name', 'provider', 'model', 'systemPrompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_agent',
      description: 'Update an existing agent. Skills must be in English.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: 'Verify with list_agents first' },
          name: { type: 'string' },
          description: { type: 'string' },
          provider: { type: 'string', enum: ['copilot', 'claude', 'gemini', 'openrouter', 'openai'] },
          model: { type: 'string' },
          systemPrompt: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          contextNotes: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['agent_id'],
      },
    },
  },

  // ── Shell ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a safe read-only shell command (whitelist enforced).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },

  // ── Files ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a local file (project/workspace dirs only, 512KB max).',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Default: utf8' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a local file (project/workspace dirs only).',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          content: { type: 'string' },
          mode: { type: 'string', enum: ['overwrite', 'append'], description: 'Default: overwrite' },
        },
        required: ['file_path', 'content'],
      },
    },
  },

  // ── Network ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to an external URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'Default: GET' },
          headers: { type: 'object' },
          body: { type: 'string', description: 'JSON string for POST/PUT' },
          timeout_ms: { type: 'number', description: `Default: ${TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS}` },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: [
        'Search the web for current information.',
        'Backend priority: Brave (BRAVE_API_KEY) → Tavily (TAVILY_API_KEY) → DuckDuckGo HTML → DuckDuckGo Instant → browser.',
        'Set TAVILY_API_KEY or BRAVE_API_KEY in .env for best results.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_results: { type: 'number', description: 'Default: 5, max: 10' },
        },
        required: ['query'],
      },
    },
  },

  // ── Browser ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'browse_web',
      description: [
        'Navigate to a URL using a real headless browser and extract readable text content.',
        'Works on JavaScript-heavy pages that fetch() cannot handle.',
        'Requires: npm install -g agent-browser',
        'Use this for: reading web pages, articles, documentation, any URL that needs JS to render.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to navigate to' },
          extract: { type: 'string', enum: ['text', 'screenshot'], description: 'What to extract (default: text)' },
          wait_ms: { type: 'number', description: 'Milliseconds to wait for JS to load (default: 2000)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_search',
      description: [
        'Search Google (or Bing/DuckDuckGo) using a real browser — no API key needed.',
        'Use this when search_web fails or returns no results.',
        'Requires: npm install -g agent-browser',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          engine: { type: 'string', enum: ['google', 'duckduckgo', 'bing'], description: 'Default: google' },
          max_results: { type: 'number', description: 'Max results to return (default: 5)' },
        },
        required: ['query'],
      },
    },
  },

  // ── Memory / Learning ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'save_lesson',
      description: [
        'Save a lesson, pattern, error, or user preference for future sessions.',
        'Write lesson text in English.',
        'Lessons that recur 3+ times are auto-promoted into permanent context.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          lesson: {
            type: 'string',
            description: 'Lesson text in English. Be specific and actionable.',
          },
          type: {
            type: 'string',
            enum: [
              'pattern',          // successful behavior to repeat
              'user_preference',  // how this user likes things done
              'routing',          // which agent handles which task type
              'fact',             // factual info to remember
              'tool_error',       // tool failure to avoid repeating
              'feature_request',  // something user wants that doesn't exist yet
              'knowledge_gap',    // something Brain didn't know but should
              'best_practice',    // better approach discovered
            ],
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Optional — auto-inferred from type and recurrence if not provided.',
          },
          area: {
            type: 'string',
            enum: ['routing', 'tool', 'memory', 'api', 'ui', 'content', 'config', 'unknown'],
            description: 'Optional — which part of the system this lesson applies to.',
          },
        },
        required: ['lesson'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lessons',
      description: 'Query stored lessons. Use to review what Brain has learned, find promoted rules, or audit patterns.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['pattern', 'user_preference', 'routing', 'fact', 'tool_error', 'feature_request', 'knowledge_gap', 'best_practice'],
            description: 'Filter by lesson type.',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          status: {
            type: 'string',
            enum: ['pending', 'promoted', 'resolved', 'wont_fix'],
          },
          limit: {
            type: 'number',
            description: 'Max lessons to return (default: 20)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_lesson',
      description: 'Mark a lesson as resolved (no longer relevant) or wont_fix (known, not changing). Use lesson ID from get_lessons.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lesson ID from get_lessons' },
          status: { type: 'string', enum: ['resolved', 'wont_fix'], description: 'Default: resolved' },
        },
        required: ['id'],
      },
    },
  },

  // ── Telegram ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'send_telegram',
      description: 'Send a proactive message to the owner via Telegram.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: `Max ${TELEGRAM_CONSTANTS.MESSAGE_CHUNK_SIZE} chars` },
        },
        required: ['message'],
      },
    },
  },

  // ── Skills ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'import_skill',
      description: [
        'Import a skill from a SKILL.md file URL or raw content.',
        'For GitHub: open the file → click "Raw" → copy that URL.',
        'Optionally add parsed instructions to an existing agent via target_agent_id.',
        'Note: slug-based import is not supported — use direct raw URL instead.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Raw URL to a SKILL.md file. GitHub example: https://raw.githubusercontent.com/openclaw/openclaw/main/.agents/github/SKILL.md',
          },
          content: {
            type: 'string',
            description: 'Raw SKILL.md content to parse directly (paste the file contents)',
          },
          target_agent_id: {
            type: 'string',
            description: 'Agent ID to add the skill instructions to. Use list_agents to find IDs.',
          },
        },
      },
    },
  },

  // ── MCP ──────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_mcp_servers',
      description: 'List all configured MCP servers, their connection status, and available tools.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_mcp_server',
      description: [
        'Create a new MCP server configuration.',
        'Use this when user wants to connect to an external service (Monday, Slack, GitHub, etc.).',
        'After creating, always call mcp_connect to discover available tools.',
        'Monday.com example: url="https://mcp.monday.com/mcp", authType="bearer", authToken="<user_token>"',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name, e.g. "Monday.com"' },
          url: { type: 'string', description: 'MCP server URL. Monday: https://mcp.monday.com/mcp' },
          authType: { type: 'string', enum: ['bearer', 'api_key', 'basic', 'none'], description: 'Auth method. Monday uses "bearer"' },
          authToken: { type: 'string', description: 'API token / Bearer token' },
          description: { type: 'string', description: 'Optional description' },
          type: { type: 'string', description: 'Provider type hint, e.g. "monday", "slack", "github", "custom"' },
        },
        required: ['name', 'url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mcp_connect',
      description: 'Connect to a configured MCP server and discover its available tools. Run after create_mcp_server.',
      parameters: {
        type: 'object',
        properties: {
          server_id: { type: 'string', description: 'Server ID from list_mcp_servers' },
          server_name: { type: 'string', description: 'Server name (alternative to ID)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mcp_call',
      description: [
        'Call a tool on a connected MCP server.',
        'Use list_mcp_servers to see available servers and their tools.',
        'Example: { server: "Monday.com", tool: "get_boards", args: {} }',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'Server name (from list_mcp_servers)' },
          tool: { type: 'string', description: 'Tool name to invoke' },
          args: { type: 'object', description: 'Arguments for the tool' },
        },
        required: ['server', 'tool'],
      },
    },
  },
];

module.exports = { TOOL_DEFINITIONS };