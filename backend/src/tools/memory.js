/**
 * tools/memory.js — Self-learning tools
 *   - save_lesson
 *   - get_lessons
 *   - resolve_lesson
 *
 * Note: This file lives in backend/src/tools/
 * All requires use '../' to reach backend/src/
 */

async function save_lesson({ lesson, type = 'fact', priority, area, tags }) {
  const selfLearn = require('../self-learn');
  const entry = selfLearn.storeLesson({
    type,
    trigger: lesson.slice(0, 60),
    lesson,
    priority,
    area,
    tags: Array.isArray(tags) ? tags : undefined,
  });
  return {
    saved: true,
    id: entry.id,
    type: entry.type,
    priority: entry.priority,
    status: entry.status,
    area: entry.area,
    recurrenceCount: entry.recurrenceCount,
    promoted: entry.status === 'promoted',
    total_lessons: selfLearn.getLessonCount(),
  };
}

async function get_lessons({ type, priority, status, limit = 20 }) {
  const selfLearn = require('../self-learn');
  let results = selfLearn.getLessons();

  if (type)     results = results.filter(l => l.type === type);
  if (priority) results = results.filter(l => l.priority === priority);
  if (status)   results = results.filter(l => l.status === status);

  results = results
    .sort((a, b) => b.recurrenceCount - a.recurrenceCount || b.lastSeen - a.lastSeen)
    .slice(0, limit);

  return {
    total_matching: results.length,
    stats: selfLearn.getStats ? selfLearn.getStats() : {},
    lessons: results.map(l => ({
      id: l.id,
      type: l.type,
      priority: l.priority,
      status: l.status,
      area: l.area,
      lesson: l.lesson,
      recurrenceCount: l.recurrenceCount,
      tags: l.tags,
      lastSeen: new Date(l.lastSeen).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    })),
  };
}

async function resolve_lesson({ id, status = 'resolved' }) {
  const selfLearn = require('../self-learn');
  const updated = selfLearn.resolvelesson(id, status);
  if (!updated) return { error: `Lesson not found: ${id}` };
  return {
    ok: true,
    id: updated.id,
    lesson: updated.lesson.slice(0, 80),
    status: updated.status,
  };
}

module.exports = { save_lesson, get_lessons, resolve_lesson };