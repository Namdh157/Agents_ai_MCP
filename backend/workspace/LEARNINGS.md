
---
**[14:34:15 16/3/2026]** `HIGH` · `ui`

User preference: Always display Monday.com or MCP list data as a single HTML <table> inside a scrollable container (e.g., <div style='max-height:400px;overflow:auto'>). Do not use Markdown tables or plain text for Monday data.

*Tags: user_preference*

---
**[18:56:22 16/3/2026]** `HIGH` · `tool`

When fetching Monday.com board items with column data (status, assignee, estimated time, dates), NEVER call mcp_call with tool 'get_board_items_page' — it returns items WITHOUT column_values. ALWAYS use mcp_call with tool 'all_monday_api' and a GraphQL query that includes inline fragments: ... on StatusValue { label } ... on PeopleValue { persons_and_teams { id kind } } ... on NumbersValue { number }

*Tags: best_practice, tools*

---
**[19:58:15 16/3/2026]** `CRITICAL` · `tool`

For Monday.com tasks: skip list_mcp_servers, go directly to mcp_call tool='all_monday_api' with a single GraphQL query containing inline fragments for StatusValue/PeopleValue/NumbersValue. Never use get_board_items_page. Maximum 3 mcp_call total per request.

*Tags: best_practice, tools*
