/**
 * tools/reminders.js — General Reminder Tool Implementations
 */

const db = require('../db');
const scheduler = require('../scheduler');

async function create_reminder({ task, cron_expr, target_chat_id }) {
  const id = 'rem-' + Date.now().toString(36);
  // target_chat_id is used to schedule reminder back to the group
  const user_id = target_chat_id || 'owner'; 

  const row = {
    id,
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

  // Sync cron jobs
  await scheduler.syncJobs();

  return { 
    success: true, 
    reminder_id: id, 
    message: `Đã thiết lập nhắc nhở "${task}" vào lúc ${cron_expr}` 
  };
}

async function list_reminders() {
  const { data, error } = await db.from('reminders').select('*').eq('is_active', true);
  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  return { reminders: data };
}

async function delete_reminder({ reminder_id }) {
  const { error } = await db.from('reminders').update({ is_active: false }).eq('id', reminder_id);
  if (error) {
    throw new Error(`DB Error: ${error.message}`);
  }

  // Sync cron jobs
  await scheduler.syncJobs();

  return { success: true, message: `Đã xoá nhắc nhở (ID: ${reminder_id})` };
}

module.exports = {
  create_reminder,
  list_reminders,
  delete_reminder
};
