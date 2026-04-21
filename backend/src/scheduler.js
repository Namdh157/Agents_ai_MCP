const cron = require('node-cron');
const db = require('./db');
const logger = require('./logger');
const telegram = require('./telegram');

const runningJobs = new Map();

async function checkAndTriggerReminders() {
  try {
    const { data: reminders, error } = await db.from('reminders').select('*').eq('is_active', true);
    if (error) throw new Error(error.message);

    // Xoá cronjobs cũ
    for (const [id, job] of runningJobs) {
      job.stop();
      runningJobs.delete(id);
    }

    // Đăng ký lại cronjobs
    for (const r of reminders) {
      if (!cron.validate(r.cron_expr)) {
        logger.warn('scheduler', `Cron expression không hợp lệ cho reminder ${r.id}: ${r.cron_expr}`);
        continue;
      }

      const job = cron.schedule(r.cron_expr, () => {
        logger.info('scheduler', `Triggered reminder: ${r.task}`);
        if (telegram.triggerAgentReminder) {
            telegram.triggerAgentReminder(r.user_id, r.task, r.id);
        }
      });
      
      runningJobs.set(r.id, job);
    }
    logger.info('scheduler', `Đã đồng bộ ${runningJobs.size} lịch nhắc nhở.`);
  } catch (err) {
    logger.error('scheduler', `Lỗi đồng bộ reminders: ${err.message}`);
  }
}

// Chạy hàm này khi server start để đồng bộ lần đầu
// Hàm này cũng được gọi từ `health_tools.js` mỗi khi có thay đổi DB
module.exports = {
  syncJobs: checkAndTriggerReminders
};
