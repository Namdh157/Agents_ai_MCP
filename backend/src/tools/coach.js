/**
 * tools/coach.js — Tools for the Adaptive Coaching Agent
 */

const db = require('../db');

/**
 * Lấy lịch sử tiến độ của một chủ đề (topic)
 */
async function get_topic_progress({ topic }) {
  const { data, error } = await db.from('user_progress').select('*').eq('topic', topic).single();
  
  if (error) {
    if (error.code === 'PGRST116') { // Not found in Supabase
      return { 
        topic, 
        level: 1, 
        failed_attempts: 0, 
        history: [], 
        is_new: true,
        message: `Chưa có dữ liệu cho chủ đề "${topic}". Bắt đầu từ Level 1.` 
      };
    }
    throw new Error(`DB Error: ${error.message}`);
  }

  return { is_new: false, ...data };
}

/**
 * Cập nhật tiến độ: thay đổi level, ghi nhận thất bại, hoặc ghi vào history
 */
async function update_topic_progress({ topic, level_change = 0, add_failure = false, history_note = '' }) {
  // Get current
  const { data: current, error: fetchError } = await db.from('user_progress').select('*').eq('topic', topic).single();
  
  let newLevel = 1;
  let newFails = 0;
  let newHistory = [];

  if (!fetchError && current) {
    newLevel = current.level + level_change;
    if (newLevel < 1) newLevel = 1;
    
    newFails = add_failure ? current.failed_attempts + 1 : current.failed_attempts;
    newHistory = current.history || [];
  } else if (fetchError && fetchError.code === 'PGRST116') {
     // Default initialization
     newLevel = 1 + level_change;
     if (newLevel < 1) newLevel = 1;
     newFails = add_failure ? 1 : 0;
  } else {
      throw new Error(`DB Error (Fetch): ${fetchError?.message}`);
  }

  if (history_note) {
    const timestamp = new Date().toISOString();
    newHistory.unshift({ date: timestamp, note: history_note });
    // Keep max 20 history items
    if (newHistory.length > 20) newHistory.pop();
  }

  // Upsert back to database
  const { error: upsertError } = await db.from('user_progress').upsert({
    topic,
    level: newLevel,
    failed_attempts: newFails,
    history: newHistory,
    updated_at: new Date().toISOString()
  });

  if (upsertError) {
    throw new Error(`DB Error (Upsert): ${upsertError.message}`);
  }

  return {
    success: true,
    topic,
    new_level: newLevel,
    failed_attempts: newFails,
    message: `Đã cập nhật tiến độ "${topic}". Level hiện tại: ${newLevel}`
  };
}

module.exports = {
  get_topic_progress,
  update_topic_progress
};
