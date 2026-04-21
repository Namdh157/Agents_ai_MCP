#!/usr/bin/env node
/**
 * seed-context.js — Inject initial project context into Brain memory
 *
 * OPTIONAL — run this once after setup to give Brain context about the project.
 * Brain works without this; it will learn organically through conversation.
 *
 *   node seed-context.js         # add/replace seeded entries
 *   node seed-context.js --reset # delete ALL messages first, then seed
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { MEMORY_CONSTANTS, LOGGER_CONSTANTS } = require('./src/constants');
const db = require('./src/db');

const reset = process.argv.includes('--reset');
const now = Date.now();
const ts = (offsetMinutes) => now - offsetMinutes * 60 * 1000;

const seeds = [

  // ── System overview ────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'What is Brain OS? What is this system for?',
    timestamp: ts(120),
  },
  {
    role: 'assistant',
    content: `Brain OS is a local AI orchestration system. Architecture:

**Orchestrator**: GitHub Copilot via copilot-api (http://localhost:4141)
**Backend**: Express + WebSocket server (port 3333)
**Frontend**: React + Vite + Tailwind (served from backend/dist)
**Persistence**: Supabase (required — no local fallback)
**Agents**: Created by user — no defaults on first run

Key capabilities:
- 17 tools: time, agents, system, shell, pipeline, file I/O, HTTP, web search, Telegram, skill import
- Multi-backend search: Brave Search API → DuckDuckGo HTML → DDG Instant API
- Skill import: ClawHub registry, SKILL.md URLs, raw content
- Per-agent skills + context notes + auto-update
- Telegram bot with per-chat isolated memory
- Self-learning from corrections and errors`,
    timestamp: ts(119),
  },

  // ── File structure ─────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'What is the file structure of Brain OS?',
    timestamp: ts(110),
  },
  {
    role: 'assistant',
    content: `\`\`\`
multi-ai-agent/
├── backend/
│   ├── server.js          # Express + WebSocket
│   ├── seed-context.js    # Optional memory seeding
│   └── src/
│       ├── brain.js         # Copilot orchestrator
│       ├── tools.js         # 17 tools
│       ├── memory.js        # Context scoring + assembly
│       ├── agents.js        # Agent management (no defaults)
│       ├── self-learn.js    # Behavioral learning
│       ├── skill-importer.js # ClawHub + SKILL.md integration
│       ├── logger.js
│       ├── telegram.js
│       ├── db.js
│       └── constants.js
├── frontend/src/components/
│   ├── ChatTab.jsx          # Fixed summarize + streaming markdown
│   ├── AgentsTab.jsx
│   ├── AgentModal.jsx       # ClawHub import UI, no Ollama
│   ├── TelegramTab.jsx
│   ├── LogsTab.jsx
│   └── Sidebar.jsx
├── .env
├── context.md
└── README.md
\`\`\``,
    timestamp: ts(109),
  },

  // ── Agents ─────────────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'How do agents work? Are there default agents?',
    timestamp: ts(100),
  },
  {
    role: 'assistant',
    content: `**No default agents on first run.** Users create agents as needed.

To create an agent:
- Via UI: Agents tab → "+ New Agent"
- Via chat: "Create a coding agent that specializes in Node.js"

Agent structure:
\`\`\`json
{
  "id": "my-agent-id",
  "name": "My Agent",
  "provider": "copilot",
  "model": "gpt-5-mini",
  "systemPrompt": "You are...",
  "skills": [
    "Always provide complete, runnable examples",
    "Use TypeScript over JavaScript unless specified"
  ],
  "contextNotes": "Accumulated knowledge...",
  "autoUpdateContext": true,
  "active": true
}
\`\`\`

**IMPORTANT**: All auto-generated skills must be in English.

Providers: copilot | claude | gemini | openrouter | openai
(Note: ollama was removed — use copilot for local-first)`,
    timestamp: ts(99),
  },

  // ── Search backends ────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'How does web search work? Why does DuckDuckGo sometimes fail?',
    timestamp: ts(90),
  },
  {
    role: 'assistant',
    content: `The search_web tool tries 3 backends in order:

1. **Brave Search API** (best quality)
   - Set BRAVE_API_KEY in .env
   - Free tier: 2,000 queries/month
   - Get key: https://api.search.brave.com/

2. **DuckDuckGo HTML scraping** (reliable fallback)
   - No key needed
   - Scrapes the HTML results page

3. **DuckDuckGo Instant API** (last resort)
   - api.duckduckgo.com — only returns "instant answers" (Wikipedia summaries)
   - Rate-limited by IP with no published limits
   - Often returns empty results for specific queries

**Recommendation**: Set BRAVE_API_KEY for reliable search.`,
    timestamp: ts(89),
  },

  // ── Skill import ───────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'How do I import skills from ClawHub?',
    timestamp: ts(80),
  },
  {
    role: 'assistant',
    content: `Three ways to import ClawHub skills:

**1. Via chat (easiest):**
"Import the agent-browser skill from clawhub into my dev agent"
→ I'll call import_skill({ slug: "agent-browser", target_agent_id: "dev-agent" })

**2. Via UI:**
Agents → Edit agent → Skills tab → "Import from ClawHub"
- Paste a GitHub/raw SKILL.md URL
- Or search ClawHub and click "+ Add"

**3. Via API:**
\`\`\`bash
# Import by slug
POST /api/skills/import
{ "slug": "agent-browser", "target_agent_id": "dev-agent" }

# Import from URL
POST /api/skills/import
{ "url": "https://raw.githubusercontent.com/openclaw/skills/main/skills/thesethrose/agent-browser/SKILL.md" }

# Search registry
GET /api/skills/search?q=web-search&limit=10
\`\`\`

**Example: agent-browser skill:**
- Slug: "agent-browser" (by TheSethRose)
- What it does: Headless browser automation via agent-browser CLI
- Use for: web scraping, form automation, page interaction
- Requires: agent-browser CLI installed (github.com/vercel-labs/agent-browser)`,
    timestamp: ts(79),
  },

  // ── Tools ──────────────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'What tools does Brain OS have?',
    timestamp: ts(70),
  },
  {
    role: 'assistant',
    content: `Brain OS has 17 tools:

**Core**: get_current_time, list_agents, get_system_status, get_memory_stats
**Agent management**: call_agent, manage_agent, run_pipeline, create_agent, update_agent
**System**: run_command (read-only whitelist), send_telegram
**File I/O**: read_file, write_file (safe directory whitelist)
**Network**: http_request, search_web (multi-backend)
**Skills**: import_skill (ClawHub + SKILL.md URL + raw content)
**Learning**: save_lesson

The import_skill tool can:
- Import by ClawHub slug: \`{ "slug": "agent-browser" }\`
- Import from URL: \`{ "url": "https://..." }\`
- Parse raw content: \`{ "content": "---\\nname: ...\\n---\\n..." }\`
- Add to existing agent: \`{ "slug": "...", "target_agent_id": "my-agent" }\``,
    timestamp: ts(69),
  },

  // ── Self-learning ──────────────────────────────────────────────────────────
  {
    role: 'user',
    content: 'How does self-learning work? How good is it compared to ClawHub self-improving-agent skill?',
    timestamp: ts(60),
  },
  {
    role: 'assistant',
    content: `Current self-learning (self-learn.js):

**What it does:**
- Detects user corrections ("không phải", "sai rồi", "I mean...")
- Detects satisfaction signals ("đúng rồi", "perfect", "thanks")
- Learns from tool errors automatically
- Stores lessons in Supabase → injected into future context via memory scoring

**Limitations vs ClawHub self-improving-agent skill:**
- ClawHub skill reviews session logs proactively (scheduled)
- ClawHub skill has richer memory structure (hot memory + corrections log + preferences log)
- Brain OS lessons are reactive (triggered by explicit signals)
- Brain OS doesn't auto-review logs without user prompting

**Areas to improve:**
1. Scheduled log review (run every N conversations)
2. Structured memory files (separate preferences vs corrections vs facts)
3. Proactive pattern detection without explicit correction signals
4. Lesson ranking by recency + frequency`,
    timestamp: ts(59),
  },
];

const seededEntries = seeds.map(s => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + LOGGER_CONSTANTS.RANDOM_ID_SUFFIX_LENGTH),
  role: s.role,
  content: s.content,
  agent_id: 'brain',
  timestamp: s.timestamp,
  meta: { _seeded: true },
}));

async function run() {
  try {
    await db.assertConnection();
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  if (reset) {
    const { error } = await db.from('messages').delete().neq('id', '');
    if (error) {
      console.error(`❌ Failed to reset messages: ${error.message}`);
      process.exit(1);
    }
    console.log('🗑️  All messages deleted.');
  } else {
    // Remove old seeded entries only
    const { error } = await db.from('messages').delete().eq('agent_id', 'brain').contains('meta', { _seeded: true });
    if (error) {
      console.error(`❌ Failed to remove old seeded entries: ${error.message}`);
      process.exit(1);
    }
  }

  const { error: insertError } = await db.from('messages').insert(seededEntries);
  if (insertError) {
    console.error(`❌ Failed to seed context: ${insertError.message}`);
    process.exit(1);
  }

  const { count, error: countError } = await db.from('messages').select('id', { head: true, count: 'exact' });
  if (countError) {
    console.error(`❌ Failed to count: ${countError.message}`);
    process.exit(1);
  }

  if (count > MEMORY_CONSTANTS.MAX_HISTORY) {
    console.warn(`⚠️  Message count (${count}) exceeds MAX_HISTORY (${MEMORY_CONSTANTS.MAX_HISTORY})`);
  }

  console.log(`✅ Seeded ${seededEntries.length} entries`);
  console.log(`   Total messages in Supabase: ${count}`);
  if (reset) console.log('   (Full reset was performed)');
}

run();