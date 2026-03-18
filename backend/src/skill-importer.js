/**
 * skill-importer.js — Import skills from SKILL.md (OpenClaw/ClawHub format)
 *
 * Supports:
 *   - Paste raw SKILL.md content
 *   - Fetch from a raw URL (GitHub, clawhub CDN, etc.)
 *   - Browse clawhub registry via ClawHub API
 *
 * SKILL.md format (OpenClaw-compatible):
 *   ---
 *   name: skill-name
 *   description: What this skill does
 *   metadata:
 *     openclaw:
 *       emoji: 🔧
 *       requires:
 *         env: [SOME_API_KEY]
 *   ---
 *   # Skill instructions in markdown...
 */

const logger = require('./logger');

// ─── Parse YAML-ish frontmatter (lightweight, no deps) ───────────────────────

function parseFrontmatter(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) {
    return { meta: {}, body: trimmed };
  }

  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) {
    return { meta: {}, body: trimmed };
  }

  const yamlBlock = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trim();

  // Very simple YAML key: value parser (handles strings and arrays)
  const meta = {};
  const lines = yamlBlock.split('\n');
  let currentKey = null;

  for (const line of lines) {
    const trimLine = line.trim();
    if (!trimLine || trimLine.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const indent = line.search(/\S/);
    if (indent === 0) {
      // Top-level key
      currentKey = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (val) {
        // Remove quotes
        meta[currentKey] = val.replace(/^["']|["']$/g, '');
      } else {
        meta[currentKey] = {};
      }
    }
    // Nested keys are ignored for simplicity (we only need top-level name/description)
  }

  return { meta, body };
}

// ─── Convert SKILL.md to Brain OS skill format ───────────────────────────────

function skillMdToAgentSkills(content, sourceName = '') {
  const { meta, body } = parseFrontmatter(content);

  const name = meta.name || sourceName || 'Imported Skill';
  const description = meta.description || '';

  // Convert markdown body into skill instructions
  // Extract the most useful parts — headings become instruction categories
  const instructions = extractInstructions(body);

  return {
    name,
    description,
    skills: instructions,
    rawContent: body,
    meta,
  };
}

// ─── Extract skill instructions from markdown body ───────────────────────────

function extractInstructions(markdown) {
  if (!markdown) return [];

  const instructions = [];

  // Split by ## headers to get sections
  const sections = markdown.split(/\n##+ /);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    if (!lines.length) continue;

    const heading = lines[0].trim().replace(/^#+\s*/, '');
    const body = lines.slice(1).join('\n').trim();

    if (!body) continue;

    // Each section becomes one skill entry
    // Combine heading + first paragraph as a concise instruction
    const firstParagraph = body.split(/\n\n/)[0].replace(/\n/g, ' ').trim();

    if (firstParagraph.length > 20) {
      const instruction = heading
        ? `${heading}: ${firstParagraph.slice(0, 300)}`
        : firstParagraph.slice(0, 300);
      instructions.push(instruction);
    }
  }

  // If no sections found, use the whole content as one instruction
  if (instructions.length === 0 && markdown.trim()) {
    const firstBlock = markdown.split(/\n\n/)[0].replace(/\n/g, ' ').trim();
    if (firstBlock) instructions.push(firstBlock.slice(0, 300));
  }

  return instructions.slice(0, 10); // Max 10 instructions per skill
}

// ─── Fetch SKILL.md from URL ──────────────────────────────────────────────────

async function fetchSkillFromUrl(url) {
  try {
    // Convert GitHub blob URLs to raw
    const rawUrl = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');

    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Brain-OS/1.0 skill-importer' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    if (!text.trim()) throw new Error('Empty content');

    logger.info('skill-importer', `Fetched skill from: ${rawUrl}`);
    return text;
  } catch (e) {
    throw new Error(`Failed to fetch skill: ${e.message}`);
  }
}

// ─── Search clawhub registry ──────────────────────────────────────────────────

async function searchClawhub(query, limit = 10) {
  try {
    // ClawHub API — documented at https://github.com/openclaw/clawhub
    const encoded = encodeURIComponent(query);
    const url = `https://clawhub.ai/api/skills?q=${encoded}&limit=${limit}&sort=downloads`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Brain-OS/1.0 skill-importer',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`ClawHub API: ${res.status}`);
    const data = await res.json();

    // Normalize response format
    const skills = (data.skills || data.results || data.data || []).map(s => ({
      slug: s.slug || s.name,
      name: s.name || s.slug,
      description: s.description || '',
      downloads: s.downloads || s.install_count || 0,
      author: s.author || s.owner || '',
      rawUrl: s.raw_url || s.skill_url || `https://clawhub.ai/api/skills/${s.slug}/raw`,
      pageUrl: s.url || `https://clawhub.ai/skills/${s.slug}`,
    }));

    return { results: skills, total: data.total || skills.length };
  } catch (e) {
    logger.warn('skill-importer', `ClawHub search failed: ${e.message}`);
    // Return empty — caller handles fallback
    return { results: [], total: 0, error: e.message };
  }
}

// ─── Fetch skill content from clawhub ────────────────────────────────────────

async function fetchClawhubSkill(slug) {
  const urls = [
    `https://clawhub.ai/api/skills/${slug}/raw`,
    `https://clawhub.ai/skills/${slug}/raw`,
    `https://raw.githubusercontent.com/openclaw/openclaw/main/skills/${slug}/SKILL.md`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Brain-OS/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.trim()) return text;
      }
    } catch { /* try next */ }
  }

  throw new Error(`Could not fetch skill "${slug}" from clawhub`);
}

// ─── Import a skill and prepare for agent creation ───────────────────────────

async function importSkill({ url, content, slug }) {
  let rawContent;

  if (content) {
    rawContent = content;
  } else if (slug) {
    rawContent = await fetchClawhubSkill(slug);
  } else if (url) {
    rawContent = await fetchSkillFromUrl(url);
  } else {
    throw new Error('Provide url, content, or slug');
  }

  const result = skillMdToAgentSkills(rawContent, slug || '');
  logger.info('skill-importer', `Imported skill: "${result.name}" with ${result.skills.length} instructions`);
  return result;
}

module.exports = {
  importSkill,
  searchClawhub,
  fetchSkillFromUrl,
  fetchClawhubSkill,
  skillMdToAgentSkills,
  parseFrontmatter,
};