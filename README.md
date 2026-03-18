# 🧠 Brain OS

**Local AI Orchestration System** — chạy hoàn toàn trên máy của bạn.

Orchestrator: **GitHub Copilot** (qua `copilot-api`) — không cần Ollama, không cần Groq API key riêng.

Kiến trúc hiện tại: **backend + frontend tách riêng**.
- Backend: `backend/` (Express + WebSocket + tools + memory + telegram)
- Frontend: `frontend/` (React + Vite + Tailwind)
- Persistence: Supabase (bắt buộc)

---

## Tính năng

- 🤖 **Copilot Orchestrator** — dùng Copilot Pro subscription (free models sẵn có)
- 🔧 **14 Tool Calling** — file I/O, HTTP request, web search, shell, Telegram...
- 🧠 **Smart Memory** — context filtering theo score (recency + keyword + role)
- 👥 **Flexible Agents** — mỗi agent có skills + context notes riêng
- 📱 **Telegram Bot** — điều khiển từ xa
- 🌐 **Web UI** — Chat, Agents, Telegram, Logs tabs tại port 3333

---

## Setup

### 1. Clone & cài dependencies

```bash
git clone <repo>
cd multi-ai-agent
npm install

# Cài deps cho backend + frontend
npm run install:all
```

### 2. Setup GitHub Copilot proxy (bắt buộc)

```bash
# Cài copilot-api
npm install -g copilot-api

# Đăng nhập GitHub (chỉ làm 1 lần)
copilot-api auth
# → Mở URL hiện ra, nhập device code, xác nhận

# Chạy proxy (giữ terminal này mở)
copilot-api start
# → Listening at http://localhost:4141
```

### 3. Khởi động Brain OS

```bash
# Seed context ban đầu
node backend/seed-context.js

# Chạy server
npm run start

# Hoặc với model khác
node backend/server.js --port 3333 --model gpt-4.1
```

### 4. Mở Web UI

Truy cập http://localhost:3333

---

## Models GitHub Copilot Pro

| Model ID | Request Multiplier |
|-------|-------|
| `claude-haiku-4-5` | `0.33x` |
| `gemini-2.5-pro` | `1x` |
| `gemini-3-flash-preview` | `0.33x` |
| `gemini-3-pro-preview` | `1x` |
| `gemini-3.1-pro-preview` | `1x` |
| `gpt-4.1` | `0x` |
| `gpt-4o` | `0x` |
| `gpt-5-mini` | `0x` |
| `gpt-5.1` | `1x` |
| `gpt-5.1-codex` | `1x` |
| `gpt-5.1-codex-max` | `1x` |
| `gpt-5.1-codex-mini-preview` | `0.33x` |
| `gpt-5.2` | `1x` |
| `gpt-5.2-codex` | `1x` |
| `gpt-5.3-codex` | `1x` |
| `grok-code-fast-1` | `0.25x` |
| `raptor-mini-preview` | `0x` |

**Đổi model Brain:** `node backend/server.js --model gpt-4.1`

---

## Agents

Mỗi agent có thể cấu hình:
- **Provider**: copilot | claude | gemini | openrouter | openai
- **Model**: tên model của provider đó
- **System Prompt**: prompt chính
- **Skills**: danh sách instructions cụ thể
- **Context Notes**: ghi chú tích lũy (auto-update sau mỗi reply)
- **Auto Update Context**: bật để agent tự học preference

### Default Agents

| Agent | Provider | Model | Dùng cho |
|-------|----------|-------|---------|
| Dev Agent | copilot | gpt-4.1 | Code, debug, architecture |
| Search Agent | gemini | gemini-2.0-flash | Research, tìm kiếm |

---

## Tools (14)

| Tool | Mô tả |
|------|-------|
| `get_current_time` | Thời gian VN |
| `list_agents` | Liệt kê agents |
| `get_system_status` | System info |
| `call_agent` | Gọi agent chuyên biệt |
| `manage_agent` | Bật/tắt agent |
| `get_memory_stats` | Memory stats |
| `run_command` | Shell (read-only whitelist) |
| `run_pipeline` | Parallel/sequential agents |
| `save_lesson` | Self-learn |
| `send_telegram` | Gửi Telegram |
| `read_file` | Đọc file local |
| `write_file` | Ghi file local |
| `http_request` | HTTP GET/POST |
| `search_web` | DuckDuckGo search |

---

## API Endpoints

```
GET  /api/status               — status tổng quan
POST /api/brain/check          — kiểm tra copilot-api
POST /api/brain/model          — đổi brain model
GET  /api/agents               — danh sách agents
POST /api/agents               — tạo agent mới
PUT  /api/agents/:id           — sửa agent
DELETE /api/agents/:id         — xóa agent
GET  /api/agents/:id/skills    — xem skills
PUT  /api/agents/:id/skills    — cập nhật skills
GET  /api/agents/:id/context   — xem context notes
PUT  /api/agents/:id/context   — cập nhật context notes
DELETE /api/agents/:id/context — xóa context notes
GET  /api/tools                — danh sách tools
GET  /api/memory               — chat history
POST /api/memory/summarize     — tóm tắt lịch sử
GET  /api/lessons              — self-learn lessons
GET  /api/logs                 — system logs
GET  /api/telegram             — trạng thái telegram
GET  /api/telegram/messages    — log telegram gần đây
POST /api/telegram/connect     — kết nối bot bằng token
POST /api/telegram/owner       — set owner chat id
POST /api/telegram/send        — gửi tin chủ động
POST /api/telegram/disconnect  — ngắt kết nối bot
```

---

## Environment Variables

```bash
# Chỉ cần nếu dùng Claude/Gemini/OpenRouter làm agent (không cần cho Copilot)
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...

# (Tuỳ chọn) OpenRouter referer override
OPENROUTER_REFERER=http://localhost:3333

# Supabase (bắt buộc)
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Tùy chỉnh copilot-api URL (mặc định: http://localhost:4141)
COPILOT_API_URL=http://localhost:4141

# Port và model
PORT=3333
BRAIN_MODEL=gpt-5-mini
```

Lưu ý Telegram:
- Token được nhập từ UI/API `/api/telegram/connect` và lưu vào Supabase (`config`).
- Hiện runtime chưa đọc token Telegram trực tiếp từ env.

---

## WebSocket Protocol

```json
// Client → Server
{ "type": "chat", "content": "Xin chào", "agentId": "brain", "requestId": "abc" }
{ "type": "clear_chat", "agentId": "brain" }
{ "type": "load_history", "agentId": "brain", "limit": 30 }

// Server → Client
{ "type": "chat_token", "token": "Xin", "requestId": "abc" }
{ "type": "chat_done", "requestId": "abc", "stats": {...} }
{ "type": "chat_error", "error": "...", "requestId": "abc" }
{ "type": "tool_call", "tool": "get_current_time", "args": {}, "requestId": "abc" }
{ "type": "log", "entry": {...} }
```

---

## Troubleshooting

**copilot-api không chạy:**
```
copilot-api chưa chạy. Hãy chạy: npx copilot-api@latest start
```
→ Chạy `copilot-api start` và giữ terminal mở

**Port đã bị chiếm (`EADDRINUSE`)**:
- Chạy cổng khác: `node backend/server.js --port 3399`

**Token hết hạn:**
→ Chạy `copilot-api auth` lại

**Model không có:**
→ Kiểm tra plan Copilot của bạn tại https://github.com/settings/copilot

---

## Roadmap

- ✅ Phase 1: Core system
- ✅ Phase 2A: 14 Tool Calling (file I/O, HTTP, search)
- ✅ Phase 2B: GitHub Copilot orchestrator
- ✅ Phase 2C: Per-agent skills & context
- ⬜ Phase 3: Self-improvement
- ⬜ Phase 4: Content pipeline (video tự động)
- ⬜ Phase 5: Multi-agent