-- Brain OS — Supabase Migration
-- Run this in your Supabase SQL editor (Database > SQL Editor)

-- Agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Chat messages (memory)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'brain',
  timestamp BIGINT NOT NULL,
  meta JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS messages_agent_id_idx ON messages (agent_id);
CREATE INDEX IF NOT EXISTS messages_timestamp_idx ON messages (timestamp);

-- Memory summaries
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  covered_ids JSONB DEFAULT '[]',
  timestamp BIGINT NOT NULL
);

-- System logs
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB
);
CREATE INDEX IF NOT EXISTS logs_level_idx ON logs (level);

-- Config (telegram token, owner id, etc.)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Self-learning lessons
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by backend with SERVICE_KEY)
CREATE POLICY "service_role_all" ON agents FOR ALL USING (true);
CREATE POLICY "service_role_all" ON messages FOR ALL USING (true);
CREATE POLICY "service_role_all" ON summaries FOR ALL USING (true);
CREATE POLICY "service_role_all" ON logs FOR ALL USING (true);
CREATE POLICY "service_role_all" ON config FOR ALL USING (true);
CREATE POLICY "service_role_all" ON lessons FOR ALL USING (true);


-- Brain OS — MCP Servers Migration
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON mcp_servers FOR ALL USING (true);

-- Brain OS — Sessions Migration
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON sessions FOR ALL USING (true);


CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON config FOR ALL USING (true);