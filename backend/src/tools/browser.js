/**
 * tools/browser.js — Headless browser tool via agent-browser CLI
 *
 * Requires agent-browser CLI (optional, for local dev):
 *   npm install -g agent-browser
 *
 * Trên môi trường cloud (Render), tự động fallback về HTTP fetch.
 *
 * Tools:
 *   - browse_web(url)      → navigate + extract readable text
 *   - browse_search(query) → search DuckDuckGo
 */

const { execSync } = require('child_process');
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

// ─── Run agent-browser command ────────────────────────────────────────────────

function runBrowser(args, timeoutMs = BROWSER_TIMEOUT_MS) {
  const cmds = [
    `agent-browser ${args}`,
    `npx --yes agent-browser ${args}`,
  ];

  for (const cmd of cmds) {
    try {
      const output = execSync(cmd, {
        timeout: timeoutMs,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 2,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { ok: true, output: output.trim() };
    } catch (e) {
      const msg = (e.stderr || e.message || '').toString();
      if (msg.includes('command not found') || msg.includes('not found') || msg.includes('ENOENT')) {
        continue;
      }
      return { ok: false, error: msg.slice(0, 500) };
    }
  }

  return {
    ok: false,
    error: 'agent-browser not installed. Run: npm install -g agent-browser',
  };
}

// ─── Extract readable text from CLI output ────────────────────────────────────

function extractPageText(rawOutput) {
  if (!rawOutput) return '';
  return rawOutput
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .slice(0, CONTENT_MAX_CHARS);
}

// ─── HTTP fetch (hoạt động trên mọi môi trường kể cả Render) ─────────────────

async function _fetchFallback(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, CONTENT_MAX_CHARS);

    return { url, type: 'fetch_fallback', content: text };
  } catch (e) {
    return { error: `Fetch failed: ${e.message}` };
  }
}

// ─── browse_web ───────────────────────────────────────────────────────────────

async function browse_web({ url, extract = 'text', wait_ms = 2000 }) {
  if (!url) return { error: 'url is required' };

  // Ưu tiên agent-browser (local dev)
  if (isBrowserAvailable()) {
    const navResult = runBrowser(`navigate "${url.replace(/"/g, '\\"')}"`, BROWSER_TIMEOUT_MS);
    if (navResult.ok) {
      if (wait_ms > 0) await new Promise(r => setTimeout(r, Math.min(wait_ms, 5000)));

      if (extract === 'screenshot') {
        const shot = runBrowser('screenshot --base64', BROWSER_TIMEOUT_MS);
        return { url, type: 'screenshot', data: shot.ok ? shot.output : null, error: shot.ok ? null : shot.error };
      }

      const textResult = runBrowser('text', BROWSER_TIMEOUT_MS);
      if (textResult.ok) {
        const content = extractPageText(textResult.output);
        return { url, type: 'text', content, truncated: content.length >= CONTENT_MAX_CHARS, length: content.length };
      }
    }
  }

  // Fallback: HTTP fetch (Render/cloud)
  const result = await _fetchFallback(url);
  return { ...result, note: 'HTTP fetch mode (agent-browser không khả dụng)' };
}

// ─── browse_search ────────────────────────────────────────────────────────────

async function browse_search({ query, engine = 'duckduckgo', max_results = 5 }) {
  if (!query) return { error: 'query is required' };

  // Ưu tiên agent-browser (local dev)
  if (isBrowserAvailable()) {
    const encodedQuery = encodeURIComponent(query);
    const searchUrls = {
      google: `https://www.google.com/search?q=${encodedQuery}&hl=en&num=${Math.min(max_results * 2, 20)}`,
      duckduckgo: `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
      bing: `https://www.bing.com/search?q=${encodedQuery}&count=${max_results}`,
    };
    const url = searchUrls[engine] || searchUrls.duckduckgo;
    const navResult = runBrowser(`navigate "${url}"`, BROWSER_TIMEOUT_MS);
    if (navResult.ok) {
      await new Promise(r => setTimeout(r, 2000));
      const textResult = runBrowser('text', BROWSER_TIMEOUT_MS);
      if (textResult.ok) {
        const results = _parseSearchText(textResult.output || '', engine, max_results);
        return { query, engine, results, count: results.length };
      }
    }
  }

  // Fallback: scrape DuckDuckGo HTML (không cần trình duyệt, hoạt động trên Render)
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) throw new Error(`DDG: ${res.status}`);
    const html = await res.text();

    const results = [];
    const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links = [];
    let m;
    while ((m = linkRe.exec(html)) !== null) {
      links.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    const snippets = [];
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    for (let i = 0; i < Math.min(links.length, max_results); i++) {
      if (links[i]?.url && links[i]?.title) {
        results.push({
          title: links[i].title.slice(0, 150),
          snippet: (snippets[i] || '').slice(0, 300),
          url: links[i].url,
          source: 'DuckDuckGo',
        });
      }
    }

    return {
      query,
      engine: 'duckduckgo-fetch',
      results,
      count: results.length,
      note: 'HTTP fetch mode (agent-browser không khả dụng)',
    };
  } catch (e) {
    return { error: `browse_search failed: ${e.message}`, query };
  }
}

// ─── Parse search results from CLI raw text ──────────────────────────────────

function _parseSearchText(text, engine, limit) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
  const results = [];

  for (let i = 0; i < lines.length && results.length < limit; i++) {
    const line = lines[i];
    if (/^(Search|Menu|Sign in|Settings|Tools|Images|News|Maps|Shopping)/i.test(line)) continue;
    if (line.length < 20 || line.length > 300) continue;
    if (/^\d+$/.test(line)) continue;

    const nextLine = lines[i + 1] || '';
    const snippet = nextLine.length > 20 && nextLine.length < 400 ? nextLine : '';

    if (snippet) {
      results.push({ title: line.slice(0, 150), snippet: snippet.slice(0, 300), source: engine });
      i++;
    }
  }
  return results;
}

// ─── Check browser status ─────────────────────────────────────────────────────

async function getBrowserStatus() {
  const available = isBrowserAvailable();
  return {
    available,
    mode: available ? 'agent-browser CLI' : 'HTTP fetch (cloud mode)',
    install_cmd: available ? null : 'npm install -g agent-browser',
    docs: 'https://github.com/TheSethRose/Agent-Browser-CLI',
  };
}

module.exports = { browse_web, browse_search, getBrowserStatus };