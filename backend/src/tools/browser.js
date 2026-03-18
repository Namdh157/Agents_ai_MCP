/**
 * tools/browser.js — Headless browser tool via agent-browser CLI
 *
 * Requires agent-browser CLI:
 *   npm install -g agent-browser
 *   (or: npx agent-browser)
 *
 * GitHub: https://github.com/TheSethRose/Agent-Browser-CLI
 *
 * Tools:
 *   - browse_web(url)          → navigate + extract readable text
 *   - browse_search(query)     → search Google/DuckDuckGo via real browser
 */

const { execSync, execFileSync } = require('child_process');
const { TOOL_CONSTANTS } = require('../constants');

const BROWSER_TIMEOUT_MS = 30000;
const CONTENT_MAX_CHARS = 8000;

// ─── Check if agent-browser is installed ─────────────────────────────────────

function isBrowserAvailable() {
  try {
    execSync('agent-browser --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    try {
      execSync('npx --yes agent-browser --version', { stdio: 'pipe', timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Run agent-browser command ─────────────────────────────────────────────────

function runBrowser(args, timeoutMs = BROWSER_TIMEOUT_MS) {
  // Try global install first, then npx fallback
  const cmds = [
    `agent-browser ${args}`,
    `npx --yes agent-browser ${args}`,
  ];

  for (const cmd of cmds) {
    try {
      const output = execSync(cmd, {
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 2, // 2MB
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { ok: true, output: output.trim() };
    } catch (e) {
      const msg = (e.stderr || e.message || '').toString();
      // If it's "command not found", try next
      if (msg.includes('command not found') || msg.includes('not found') || msg.includes('ENOENT')) {
        continue;
      }
      // Real error (not install error) — return it
      return { ok: false, error: msg.slice(0, 500) };
    }
  }

  return {
    ok: false,
    error: 'agent-browser not installed. Run: npm install -g agent-browser',
    install: 'npm install -g agent-browser',
  };
}

// ─── Extract readable text from a navigated page ─────────────────────────────

function extractPageText(rawOutput) {
  if (!rawOutput) return '';

  // agent-browser text returns plain text already
  // Strip excessive whitespace and blank lines
  return rawOutput
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .slice(0, CONTENT_MAX_CHARS);
}

// ─── browse_web ───────────────────────────────────────────────────────────────

async function browse_web({ url, extract = 'text', wait_ms = 2000 }) {
  if (!url) return { error: 'url is required' };

  // 1. Navigate
  const navResult = runBrowser(`navigate "${url.replace(/"/g, '\\"')}"`, BROWSER_TIMEOUT_MS);
  if (!navResult.ok) {
    return {
      error: navResult.error,
      fallback: 'Trying fetch instead...',
      ...await _fetchFallback(url),
    };
  }

  // Small wait for JS-heavy pages
  if (wait_ms > 0) {
    await new Promise(r => setTimeout(r, Math.min(wait_ms, 5000)));
  }

  // 2. Extract content
  if (extract === 'screenshot') {
    const screenshotResult = runBrowser('screenshot --base64', BROWSER_TIMEOUT_MS);
    return {
      url,
      type: 'screenshot',
      data: screenshotResult.ok ? screenshotResult.output : null,
      error: screenshotResult.ok ? null : screenshotResult.error,
    };
  }

  const textResult = runBrowser('text', BROWSER_TIMEOUT_MS);
  if (!textResult.ok) {
    return { url, error: textResult.error };
  }

  const content = extractPageText(textResult.output);
  return {
    url,
    type: 'text',
    content,
    truncated: content.length >= CONTENT_MAX_CHARS,
    length: content.length,
  };
}

// ─── browse_search ────────────────────────────────────────────────────────────

async function browse_search({ query, engine = 'google', max_results = 5 }) {
  if (!query) return { error: 'query is required' };

  // Build search URL
  const encodedQuery = encodeURIComponent(query);
  const searchUrls = {
    google: `https://www.google.com/search?q=${encodedQuery}&hl=en&num=${Math.min(max_results * 2, 20)}`,
    duckduckgo: `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
    bing: `https://www.bing.com/search?q=${encodedQuery}&count=${max_results}`,
  };

  const url = searchUrls[engine] || searchUrls.google;

  // Navigate
  const navResult = runBrowser(`navigate "${url}"`, BROWSER_TIMEOUT_MS);
  if (!navResult.ok) {
    return { error: navResult.error, query };
  }

  // Wait for results to load
  await new Promise(r => setTimeout(r, 2000));

  // Extract text
  const textResult = runBrowser('text', BROWSER_TIMEOUT_MS);
  if (!textResult.ok) {
    return { error: textResult.error, query };
  }

  // Parse results from raw text
  const rawText = textResult.output || '';
  const results = parseSearchResultsFromText(rawText, engine, max_results);

  return {
    query,
    engine,
    results,
    count: results.length,
    raw_preview: rawText.slice(0, 1000),
  };
}

// ─── Parse search results from raw page text ─────────────────────────────────

function parseSearchResultsFromText(text, engine, limit) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
  const results = [];

  // Heuristic: look for patterns like "Title ... URL" or "Title\nDescription"
  // Google text output typically has: title, description, URL pattern
  for (let i = 0; i < lines.length && results.length < limit; i++) {
    const line = lines[i];

    // Skip navigation/UI chrome
    if (/^(Search|Menu|Sign in|Settings|Tools|Images|News|Maps|Shopping)/i.test(line)) continue;
    if (line.length < 20 || line.length > 300) continue;
    if (/^\d+$/.test(line)) continue; // pure numbers

    // Look for a meaningful title line followed by a snippet
    const nextLine = lines[i + 1] || '';
    const snippet = nextLine.length > 20 && nextLine.length < 400 ? nextLine : '';

    if (snippet) {
      results.push({
        title: line.slice(0, 150),
        snippet: snippet.slice(0, 300),
        source: engine,
      });
      i++; // skip the snippet line
    }
  }

  return results;
}

// ─── Fetch fallback (when browser not available) ──────────────────────────────

async function _fetchFallback(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `Fetch fallback: HTTP ${res.status}` };
    const html = await res.text();
    // Strip tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
    return { url, type: 'fetch_fallback', content: text };
  } catch (e) {
    return { error: `Fetch fallback failed: ${e.message}` };
  }
}

// ─── Check browser status ─────────────────────────────────────────────────────

async function getBrowserStatus() {
  const available = isBrowserAvailable();
  return {
    available,
    install_cmd: available ? null : 'npm install -g agent-browser',
    docs: 'https://github.com/TheSethRose/Agent-Browser-CLI',
  };
}

module.exports = { browse_web, browse_search, getBrowserStatus };