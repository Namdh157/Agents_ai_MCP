/**
 * tools/skills.js — Skill import tool
 *
 * Supports two import methods:
 *   1. url     — direct URL to any SKILL.md file (GitHub raw URL recommended)
 *   2. content — paste raw SKILL.md text directly
 *
 * Slug-based import removed (unreliable URL resolution).
 * To import from ClawHub: open the skill page → find GitHub link → click Raw → copy URL.
 *
 * ⚠️  capability-evolver is blocked (known data exfiltration to ByteDance/Feishu).
 */

const logger = require('../logger');

// ─── Security ─────────────────────────────────────────────────────────────────

function isBlockedContent(text) {
  const patterns = [/feishu\.cn/i, /lark\.suite/i, /exfil/i, /webhook.*bytedance/i];
  return patterns.some(p => p.test(text));
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchSkillFromUrl(url) {
  // Convert GitHub blob URL → raw
  const rawUrl = url
    .replace(/^https:\/\/github\.com\//, 'https://raw.githubusercontent.com/')
    .replace(/\/blob\//, '/');

  const tries = rawUrl !== url ? [rawUrl, url] : [url];

  for (const u of tries) {
    try {
      const res = await fetch(u, {
        headers: { 'User-Agent': 'Brain-OS/1.0', 'Accept': 'text/plain, */*' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      if (isBlockedContent(text)) throw new Error('Blocked: data exfiltration patterns detected.');
      logger.info('tools:skills', `Fetched skill from: ${u}`);
      return text;
    } catch (e) {
      if (e.message.startsWith('Blocked:')) throw e;
    }
  }

  throw new Error(
    `Could not fetch from: ${url}\n` +
    `Use the raw file URL (GitHub → open file → click "Raw" → copy URL).`
  );
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return { meta: {}, body: trimmed };
  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: trimmed };

  const meta = {};
  for (const line of trimmed.slice(3, end).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#') || line.search(/\S/) > 0) continue;
    const ci = line.indexOf(':');
    if (ci === -1) continue;
    const k = line.slice(0, ci).trim();
    const v = line.slice(ci + 1).trim().replace(/^["']|["']$/g, '');
    if (k && v) meta[k] = v;
  }

  return { meta, body: trimmed.slice(end + 4).trim() };
}

function extractInstructions(markdown) {
  if (!markdown) return [];
  const instructions = [];

  for (const section of markdown.split(/\n#{2,3} /)) {
    const lines = section.trim().split('\n');
    if (lines.length < 2) continue;
    const heading = lines[0].trim().replace(/^#+\s*/, '');
    const firstPara = lines.slice(1).join('\n').trim().split(/\n\n/)[0].replace(/\n/g, ' ').trim();
    if (firstPara.length < 20) continue;
    instructions.push(heading ? `${heading}: ${firstPara.slice(0, 280)}` : firstPara.slice(0, 300));
  }

  if (!instructions.length) {
    const first = markdown.split(/\n\n/)[0].replace(/\n/g, ' ').trim();
    if (first.length > 20) instructions.push(first.slice(0, 300));
  }

  return instructions.slice(0, 10);
}

function parseSkillMd(rawContent, hint = '') {
  const { meta, body } = parseFrontmatter(rawContent);
  return {
    name: meta.name || hint || 'Imported Skill',
    description: meta.description || '',
    skills: extractInstructions(body),
    rawContent: body,
    meta,
  };
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

async function import_skill({ url, content, target_agent_id }) {
  if (!url && !content) {
    return {
      error: 'Provide url (raw GitHub URL to SKILL.md) or content (raw SKILL.md text).',
      tip: 'GitHub → open SKILL.md file → click "Raw" → copy that URL.',
    };
  }

  let rawContent;
  try {
    rawContent = content || await fetchSkillFromUrl(url);
  } catch (e) {
    return { error: e.message };
  }

  if (isBlockedContent(rawContent)) {
    return { error: 'Skill blocked: contains data exfiltration patterns.' };
  }

  const hint = url ? url.split('/').slice(-2, -1)[0] : '';
  const skillData = parseSkillMd(rawContent, hint);

  if (!skillData.skills.length) {
    return {
      error: 'No instructions parsed. SKILL.md should have ## headings with body text.',
      parsed_name: skillData.name,
      raw_preview: rawContent.slice(0, 300),
    };
  }

  logger.info('tools:skills', `Parsed: "${skillData.name}" — ${skillData.skills.length} instructions`);

  if (target_agent_id) {
    const agents = require('../agents');
    const agent = agents.getById(target_agent_id);
    if (!agent) return { error: `Agent not found: "${target_agent_id}". Use list_agents.` };

    const merged = [...new Set([...(agent.skills || []), ...skillData.skills])];
    agents.update(target_agent_id, { skills: merged });

    return {
      ok: true,
      action: 'added_to_agent',
      agent_id: target_agent_id,
      agent_name: agent.name,
      skill_name: skillData.name,
      instructions_added: skillData.skills.length,
      total_agent_skills: merged.length,
      instructions: skillData.skills,
    };
  }

  return {
    ok: true,
    action: 'skill_parsed',
    name: skillData.name,
    description: skillData.description,
    instructions: skillData.skills,
    instruction_count: skillData.skills.length,
  };
}

module.exports = { import_skill, fetchSkillFromUrl, parseSkillMd, parseFrontmatter };