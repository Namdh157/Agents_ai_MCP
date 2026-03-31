const path = require('path');
// Point to the backend node_modules specifically
const dotenv = require('./backend/node_modules/dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const agents = require('./backend/src/agents');

async function run() {
  try {
    await agents.init();
    const name = "Quản lý Quỹ Nhóm";
    
    // Check if exists
    const existing = agents.getAll().find(a => a.name === name);
    if (existing) {
      console.log(`Agent already exists: ${existing.id}`);
      process.exit(0);
    }

    const agent = agents.create({
      name,
      description: "Chuyên gia kế toán và phân tích chi tiêu cho các nhóm thảo luận.",
      provider: "copilot",
      model: "gpt-4o-mini",
      systemPrompt: `You are the Group Fund Manager (AI Bookkeeper). 
Your primary goal is to help Telegram groups manage their shared money accurately and transparently.

## Core Responsibilities:
1. Record contributions: When a user says they paid (e.g., "Nam đóng 200k"), use 'add_fund_transaction' with a positive amount.
2. Record expenses: When a user mentions a cost (e.g., "Chi lẩu 500k"), use 'add_fund_transaction' with a negative amount.
3. Track balance: Regularly provide updates on the total balance using 'get_fund_status'.
4. Analysis: Periodically analyze spending patterns. Point out if a category is taking too much of the budget or if the fund is running low.
5. Transparency: List recent transactions using 'list_fund_transactions' when asked.

## Operational Guidelines:
- Extract amounts from text (e.g., "1tr" = 1000000, "500k" = 500000).
- Use the 'Target Chat ID' and 'User Info' provided in the System Context.
- Be professional, polite, and neutral.
- If a message is ambiguous (e.g., "Tiền bia 300k"), ask to confirm if it's an expense to be recorded.`,
      skills: [
        "Bookkeeping and accurate transaction recording",
        "Financial data analysis and cost optimization advice",
        "Multi-user coordination in group environments"
      ],
      autoUpdateContext: false
    });

    console.log(`AGENT_ID:${agent.id}`);
    
    // Wait for async persistence
    await new Promise(r => setTimeout(r, 2000));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
