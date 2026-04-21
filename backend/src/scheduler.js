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
        // Trigger Brain OS to act as the Coach and handle the task dynamically
        const brain = require('./brain');
        const prompt = `[SYSTEM AUTO SCHEDULER]: Đã đến giờ cho nhiệm vụ/lịch hẹn: "${r.task}". 
Hãy sử dụng tool get_topic_progress để xem level của chủ đề này, sau đó gửi một giáo án/bài tập/lời nhắc phù hợp qua Telegram (tool send_telegram). 
Đồng thời, cân nhắc thiết lập một nhắc nhở mới (tool create_reminder) sau vài giờ nữa để chủ động nhắn tin hỏi thăm xem tôi đã hoàn thành nhiệm vụ này và đạt kết quả tốt không.`;
        
        try {
          brain.chat({
            userInput: prompt,
            agentId: 'brain', 
            onToken: () => {},
            onDone: () => { logger.info('scheduler', `Brain đã xử lý xong nhắc nhở: ${r.task}`); },
            onError: (err) => { logger.error('scheduler', `Brain lỗi khi xử lý nhắc nhở: ${err.message}`); }
          });
        } catch (e) {
          logger.error('scheduler', `Lỗi khi gọi Brain: ${e.message}`);
          if (telegram.triggerAgentReminder) {
            telegram.triggerAgentReminder(r.user_id, r.task, r.id); // Fallback
          }
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
