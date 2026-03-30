/**
 * tools/health.js — Personal Health Assistant Tool Implementations
 */

const db = require('../db');
const scheduler = require('../scheduler');

async function create_health_reminder({ task, cron_expr }) {
  // Vì hiện tại cấu hình cho 1 người, ta dùng ownerChatId làm user_id, 
  // hoặc để mặc định 'owner' để scheduler sử dụng.
  const id = 'rem-' + Date.now().toString(36);
  const user_id = 'owner'; 

  const row = {
    id,
    agent_id: 'health_agent',
    user_id,
    task,
    cron_expr,
    is_active: true
  };

  const { error } = await db.from('reminders').insert({
    id: row.id,
    user_id: row.user_id,
    task: row.task,
    cron_expr: row.cron_expr,
    is_active: row.is_active
  });

  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  // Đồng bộ lại cron jobs
  await scheduler.syncJobs();

  return { 
    success: true, 
    reminder_id: id, 
    message: `Đã thiết lập nhắc nhở "${task}" vào lúc ${cron_expr}` 
  };
}

async function list_health_reminders() {
  const { data, error } = await db.from('reminders').select('*').eq('is_active', true);
  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  return { reminders: data };
}

async function delete_health_reminder({ reminder_id }) {
  const { error } = await db.from('reminders').update({ is_active: false }).eq('id', reminder_id);
  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  // Đồng bộ lại cron jobs
  await scheduler.syncJobs();

  return { success: true, message: `Đã xoá nhắc nhở (ID: ${reminder_id})` };
}

module.exports = {
  create_health_reminder,
  list_health_reminders,
  delete_health_reminder
};
