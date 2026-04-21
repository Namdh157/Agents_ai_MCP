/**
 * tools/finance.js — Group Fund Transaction Implementations
 */

const db = require('../db');
const logger = require('../logger');

async function add_transaction({ amount, description, category, target_chat_id, user_info }) {
  if (!target_chat_id) throw new Error('Yêu cầu target_chat_id (Group ID)');
  
  const row = {
    chat_id: String(target_chat_id),
    user_id: String(user_info?.id || 'unknown'),
    username: user_info?.username || user_info?.first_name || 'User',
    amount: parseFloat(amount),
    description,
    category: category || 'general'
  };

  const { data, error } = await db.from('transactions').insert(row).select().single();

  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  return { 
    success: true, 
    transaction: data,
    message: `Đã ghi nhận ${amount > 0 ? 'thu' : 'chi'} ${Math.abs(amount).toLocaleString()}đ cho "${description}"`
  };
}

async function get_fund_status({ target_chat_id }) {
  if (!target_chat_id) throw new Error('Yêu cầu target_chat_id');

  const { data, error } = await db
    .from('transactions')
    .select('amount')
    .eq('chat_id', String(target_chat_id));

  if (error) throw new Error(`DB Error: ${error.message}`);

  let total_in = 0;
  let total_out = 0;

  data.forEach(t => {
    if (t.amount > 0) total_in += t.amount;
    else total_out += Math.abs(t.amount);
  });

  return {
    success: true,
    chat_id: target_chat_id,
    balance: total_in - total_out,
    total_income: total_in,
    total_expense: total_out,
    transaction_count: data.length
  };
}

async function list_fund_transactions({ target_chat_id, limit = 10 }) {
  if (!target_chat_id) throw new Error('Yêu cầu target_chat_id');

  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('chat_id', String(target_chat_id))
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`DB Error: ${error.message}`);

  return { success: true, transactions: data };
}

module.exports = {
  add_transaction,
  get_fund_status,
  list_fund_transactions
};
