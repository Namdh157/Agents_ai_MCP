# Brain OS — Conversation Context
> Paste this file at the start of a new conversation to continue developing this project.

---

## Project Overview

**Brain OS** is a local AI orchestration system running entirely on your machine.

- **Orchestrator**: GitHub Copilot via `copilot-api` at `http://localhost:4141`
- **Persistence**: Supabase (required — no local fallback)
- **Architecture**: `backend/` (Express + WebSocket) + `frontend/` (React + Vite + Tailwind)
- **No default agents** — users create agents via UI or by asking Brain in chat

---

## Directory Structure

```
multi-ai-agent/
├── backend/
│   ├── server.js            # Express + WebSocket + all API routes
│   ├── seed-context.js      # Optional: seed initial Brain memory
│   └── src/
│       ├── brain.js         # Copilot orchestrator + BRAIN_SYSTEM prompt + brainSkills
│       ├── memory.js        # Context scoring + prompt assembly + auto-compact
│       ├── agents.js        # Agent CRUD + provider dispatch (copilot/claude/gemini/openrouter/openai)
│       ├── sessions.js      # Chat session manager (separate from AI agents)
│       ├── self-learn.js    # Self-learning v2: lessons, promotion, workspace files
│       ├── mcp-manager.js   # MCP server registry + Streamable HTTP client
│       ├── skill-importer.js # SKILL.md parser (legacy — tools/skills.js is canonical)
│       ├── logger.js        # Supabase-backed logging + WS broadcast
│       ├── telegram.js      # Telegram bot (per-chat isolated memory: tg-{chatId})
│       ├── db.js            # Supabase client singleton
│       ├── constants.js     # All magic numbers centralized
│       └── tools/
│           ├── index.js     # Public entry point
│           ├── definitions.js # All TOOL_DEFINITIONS schemas (26 tools)
│           ├── executor.js  # executeTool + executeToolsParallel
│           ├── agents.js    # list_agents, call_agent, manage_agent, run_pipeline, create_agent, update_agent
│           ├── system.js    # get_current_time, get_system_status, get_memory_stats
│           ├── shell.js     # run_command (read-only whitelist)
│           ├── files.js     # read_file, write_file (safe dirs)
│           ├── network.js   # http_request, search_web (5 backends)
│           ├── browser.js   # browse_web, browse_search (agent-browser CLI)
│           ├── memory.js    # save_lesson, get_lessons, resolve_lesson
│           ├── telegram.js  # send_telegram
│           ├── skills.js    # import_skill (URL or raw content)
│           └── mcp.js       # list_mcp_servers, create_mcp_server, mcp_connect, mcp_call
├── frontend/
│   └── src/
│       ├── App.jsx          # Routes + WebSocket handler + queries
│       ├── constants.js
│       ├── hooks/useWebSocket.js
│       └── components/
│           ├── ChatTab.jsx      # Sessions panel + chat area + streaming markdown
│           ├── AgentsTab.jsx    # Agent grid/list + AgentModal
│           ├── AgentModal.jsx   # Create/edit agents, import skills from URL
│           ├── McpTab.jsx       # MCP server management
│           ├── McpModal.jsx     # Add/edit MCP server
│           ├── TelegramTab.jsx
│           ├── LogsTab.jsx
│           ├── Dashboard.jsx    # Stats + recent logs + agent list
│           ├── Sidebar.jsx
│           └── Skeleton.jsx
├── .env
├── .env.example
├── context.md       ← this file
├── README.md
├── supabase-migration.sql
└── package.json
```

---

## How to Run

```bash
# 1. Copilot proxy (keep this terminal open)
npx copilot-api@latest start
# First time: npx copilot-api@latest auth

# 2. Install dependencies
npm run install:all

# 3. Optionally seed initial Brain memory
node backend/seed-context.js

# 4. Start (builds frontend + runs backend at :3333)
npm run start

# Dev mode (hot reload both)
npm run dev

# Custom port/model
node backend/server.js --port 3399 --model gpt-4.1
```

---

## Architecture: One Orchestrator, Many Sessions

Brain OS uses **a single orchestrator (brain.js)** that handles all sessions.
Memory is isolated per session via `agentId` scoping in `memory.js`.

### System prompt assembly order (per chat turn):

```
BRAIN_SYSTEM          ← hardcoded, global, never changes
+ brainSkills         ← global, user-defined, stored in Supabase config.brain_skills
+ (planned) session.systemContext  ← per-session optional context
+ lessonsContext      ← promoted rules (×3+ recurrence) + relevant lessons
+ memory context      ← per-session messages (scored by recency + keyword)
```

### Session types:
| agentId pattern | What it is |
|-----------------|-----------|
| `brain`         | Default main session |
| `session-{id}`  | User-created named sessions (isolated memory) |
| `tg-{chatId}`   | Telegram per-chat sessions (isolated memory) |

### Agents vs Sessions:
- **Sessions** = named conversation contexts for the Brain orchestrator. Isolated memory, same Brain brain.
- **Agents** = specialized LLMs (Claude, Gemini, etc.) with their own system prompts and skills. Called via `call_agent` tool or selected in Chat dropdown.

---

## Storage Model

Supabase-only — backend exits on startup if unavailable.

### Tables:
| Table | Contents |
|-------|----------|
| `messages` | Chat history, scoped by `agent_id` |
| `summaries` | Auto-compact summaries, scoped by `agent_id` |
| `agents` | Specialist agent configs |
| `sessions` | Chat session metadata |
| `mcp_servers` | MCP server configs |
| `lessons` | Self-learning lesson store |
| `logs` | System logs |
| `config` | Key-value: `brain_skills`, `telegramToken`, `telegramOwnerChatId` |

---

## Tools (26)

### System
| Tool | Description |
|------|-------------|
| `get_current_time` | VN timezone (UTC+7) |
| `get_system_status` | CPU, RAM, model, search backend, browser availability |
| `get_memory_stats` | Message counts per agent/session |

### Agent management
| Tool | Description |
|------|-------------|
| `list_agents` | All agents + Brain (always first, `_isBrain: true`) |
| `call_agent` | Delegate to specialist — always list_agents first |
| `manage_agent` | Enable/disable |
| `run_pipeline` | Parallel or sequential multi-agent tasks |
| `create_agent` | Create specialist agent (skills must be in English) |
| `update_agent` | Update agent or Brain itself (agent_id: "brain") |

### Shell & Files
| Tool | Description |
|------|-------------|
| `run_command` | Read-only shell whitelist |
| `read_file` | project/ and ~/workspace/ |
| `write_file` | project/ and ~/workspace/ |

### Network
| Tool | Description |
|------|-------------|
| `http_request` | HTTP GET/POST |
| `search_web` | 5 backends: Brave → Tavily → DDG HTML → DDG Instant → browser |
| `browse_web` | Headless browser via agent-browser CLI |
| `browse_search` | Real browser search (Google/DDG/Bing) |

### Memory & Learning
| Tool | Description |
|------|-------------|
| `save_lesson` | Store lesson (recurrence ≥3 → auto-promote to permanent rules) |
| `get_lessons` | Query stored lessons by type/priority/status |
| `resolve_lesson` | Mark lesson resolved or wont_fix |

### Communication
| Tool | Description |
|------|-------------|
| `send_telegram` | Proactive message to owner |

### Skills
| Tool | Description |
|------|-------------|
| `import_skill` | Parse SKILL.md from URL or raw content → add to agent |

### MCP
| Tool | Description |
|------|-------------|
| `list_mcp_servers` | All servers + connected tools (auto-reconnects empty ones) |
| `create_mcp_server` | Register new MCP server |
| `mcp_connect` | Initialize + discover tools (captures Mcp-Session-Id) |
| `mcp_call` | Invoke tool on connected server (auto-reconnects on 400) |

---

## Search Backends (priority order)

1. **Brave Search** — `BRAVE_API_KEY` (free: 2K/month, api.search.brave.com)
2. **Tavily** — `TAVILY_API_KEY` (free: 1K/month, ai-optimized, includes AI answer summary)
3. **DuckDuckGo HTML** — no key, scrapes html.duckduckgo.com
4. **DuckDuckGo Instant** — no key, instant answers only (limited)
5. **agent-browser** — real headless browser (last resort, requires `npm i -g agent-browser`)

---

## Brain Skills (Persistent Global Rules)

Stored in Supabase `config` table under key `brain_skills`. Injected into every session's system prompt.

```bash
# Via chat:
"Add a skill: always display data tables as HTML with a scrollable container"

# Via tool:
update_agent({ agent_id: "brain", skills: [...currentSkills, "new skill"] })

# CRITICAL: always list_agents first to read current skills before updating
# Never pass empty array unless explicitly removing all skills
```

---

## Self-Learning v2

### Lesson lifecycle:
```
storeLesson() → recurrenceCount++ on duplicate trigger
             → recurrenceCount ≥ 3 → status: "promoted"
             → promoted lessons injected as [RULE ×N] in every system prompt
```

### Workspace files (backend/workspace/):
- `LEARNINGS.md` — corrections, patterns, preferences
- `ERRORS.md` — tool failures to avoid repeating
- `FEATURE_REQUESTS.md` — user wishes

### Lesson types:
`pattern` | `user_preference` | `routing` | `fact` | `tool_error` | `feature_request` | `knowledge_gap` | `best_practice`

---

## MCP Integration

Supports MCP Streamable HTTP (2025-03-26 spec) — Monday.com and others requiring `Mcp-Session-Id`.

### Flow:
1. `create_mcp_server` → register config
2. `mcp_connect` → initialize + capture session ID + discover tools
3. `mcp_call` → invoke with EXACT tool name from step 2
4. Session auto-reconnects on 400/session-expired errors

### CRITICAL rules (in BRAIN_SYSTEM):
- Sub-agents do NOT have `mcp_call` access — Brain calls it directly
- NEVER guess tool names — use `list_mcp_servers` to get exact names
- NEVER use `call_agent` for MCP tasks

---

## API Endpoints

```
GET  /api/status
POST /api/brain/check
POST /api/brain/model

GET/POST/PUT/DELETE  /api/agents
PUT                  /api/agents/brain           ← model only
GET/PUT              /api/agents/:id/skills
GET/PUT/DELETE       /api/agents/:id/context

POST                 /api/skills/import
GET                  /api/skills/search
GET                  /api/skills/preview

GET/DELETE           /api/memory
POST                 /api/memory/summarize
GET                  /api/context/health

GET  /api/tools
GET/DELETE           /api/logs
GET/DELETE/PATCH     /api/lessons
GET                  /api/lessons/promoted
GET                  /api/lessons/stats
GET                  /api/lessons/workspace/:file

GET/POST/PUT/DELETE  /api/sessions

GET/POST/PUT/DELETE  /api/mcp/servers
POST                 /api/mcp/servers/:id/connect
POST                 /api/mcp/servers/:id/disconnect
GET                  /api/mcp/servers/:id/tools

GET/POST/DELETE      /api/telegram/...
```

---

## WebSocket Protocol

```json
// Client → Server
{ "type": "chat",         "content": "...", "agentId": "session-abc", "requestId": "xyz" }
{ "type": "clear_chat",   "agentId": "session-abc" }
{ "type": "load_history", "agentId": "session-abc", "limit": 50 }

// Server → Client
{ "type": "chat_token",  "token": "...", "requestId": "xyz" }
{ "type": "chat_done",   "requestId": "xyz", "stats": { "estimatedTokens": 1234, "utilizationPct": 42, ... } }
{ "type": "chat_error",  "error": "...", "requestId": "xyz" }
{ "type": "tool_call",   "tool": "search_web", "args": {}, "requestId": "xyz" }
{ "type": "log",         "entry": { "level": "info", "source": "brain", "message": "..." } }
{ "type": "history",     "messages": [...] }
{ "type": "chat_cleared" }
{ "type": "telegram_status" | "telegram_message" }
{ "type": "mcp_updated" }
```

---

## Memory Management

### Context assembly strategy:
- **Token budget**: 100k tokens (chars / 4)
- **Head/tail preservation**: always keep first 2 + last 8 messages
- **Keyword scoring**: recency (50%) + keyword match (40%) + role bonus (10%)
- **Turn completeness**: never orphan a user message without its assistant reply
- **Auto-compact**: when agent history > 60 messages → summarize oldest 40% silently

### Context health levels:
| `utilizationPct` | Health |
|-----------------|--------|
| < 50% | `good` |
| 50–75% | `ok` |
| 75–90% | `warning` |
| ≥ 90% | `critical` |

---

## Planned Improvements

- [ ] `session.systemContext` — per-session extra system prompt (e.g. "This session is for the React project, stack: Next.js 14...")
- [ ] Lesson scheduling — proactive review of session logs (not just reactive on correction signals)
- [ ] Session templates — create a session from a pre-defined context (coding, research, writing...)

---

## Known Issues & Notes

- `EADDRINUSE`: change port with `--port 3399`
- Telegram token stored via `/api/telegram/connect` → Supabase `config` (not read from `.env` at runtime)
- Frontend must be built (`npm run build:frontend`) for production; dev mode uses Vite proxy at `:5173`
- `seed-context.js` is optional — only needed for pre-seeded Brain memory
- `copilot-api auth` only needed once per GitHub account; `copilot-api start` must stay running

---

## How to Use This File

Paste contents at the start of a new Claude conversation:

> "This is the context for my Brain OS project. [your question here]"