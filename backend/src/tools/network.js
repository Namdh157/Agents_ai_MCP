/**
 * tools/network.js — Network tools
 *   - http_request
 *   - search_web  (5 backends: Brave → Tavily → DDG HTML → DDG Instant → browser)
 *
 * Priority order (first backend with results wins):
 *   1. Brave Search  — set BRAVE_API_KEY  (free 2K/month, api.search.brave.com)
 *   2. Tavily        — set TAVILY_API_KEY (free 1K/month, tavily.com) ← AI-optimized
 *   3. DDG HTML      — no key, scrapes html.duckduckgo.com
 *   4. DDG Instant   — no key, instant answers only (limited)
 *   5. Browser       — agent-browser CLI, real headless browser (last resort)
 */

const logger = require('../logger');
const { TOOL_CONSTANTS } = require('../constants');

// ─── http_request ──────────────────────────────────────────────────────────────

async function http_request({ url, method = 'GET', headers = {}, body, timeout_ms = TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS }) {
  try {
    const opts = {
      method,
      headers: { 'User-Agent': 'Brain-OS/1.0', ...headers },
      signal: AbortSignal.timeout(timeout_ms),
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      opts.body = body;
      if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, opts);
    const text = await res.text();

    let parsed = null;
    try { parsed = JSON.parse(text); } catch { }

    return {
      status: res.status,
      ok: res.ok,
      url,
      body: parsed || text.slice(0, TOOL_CONSTANTS.HTTP_TEXT_PREVIEW_LENGTH),
      truncated: !parsed && text.length > TOOL_CONSTANTS.HTTP_TEXT_PREVIEW_LENGTH,
    };
  } catch (e) {
    return { error: `HTTP request failed: ${e.message}`, url };
  }
}

// ─── Search backends ──────────────────────────────────────────────────────────

async function _searchBrave(query, limit) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      },
      signal: AbortSignal.timeout(TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`Brave: ${res.status}`);
  const data = await res.json();
  return (data.web?.results || []).map(r => ({
    title: r.title,
    snippet: r.description || '',
    url: r.url,
    source: 'Brave',
  }));
}

async function _searchDDGHtml(query, limit) {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`DDG HTML: ${res.status}`);
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
  for (let i = 0; i < Math.min(links.length, limit); i++) {
    if (links[i].url && links[i].title) {
      results.push({
        title: links[i].title.slice(0, TOOL_CONSTANTS.SEARCH_TITLE_PREVIEW_LENGTH),
        snippet: (snippets[i] || '').slice(0, TOOL_CONSTANTS.SEARCH_SNIPPET_PREVIEW_LENGTH),
        url: links[i].url,
        source: 'DuckDuckGo',
      });
    }
  }
  return results;
}

async function _searchDDGInstant(query, limit) {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    {
      headers: { 'User-Agent': 'Brain-OS/1.0' },
      signal: AbortSignal.timeout(TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`DDG Instant: ${res.status}`);
  const data = await res.json();

  const results = [];
  if (data.Abstract) {
    results.push({
      title: data.Heading || query,
      snippet: data.Abstract,
      url: data.AbstractURL || '',
      source: data.AbstractSource || 'DuckDuckGo',
    });
  }
  for (const topic of (data.RelatedTopics || []).slice(0, limit - 1)) {
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.slice(0, TOOL_CONSTANTS.SEARCH_TITLE_PREVIEW_LENGTH),
        snippet: topic.Text.slice(0, TOOL_CONSTANTS.SEARCH_SNIPPET_PREVIEW_LENGTH),
        url: topic.FirstURL,
        source: 'DuckDuckGo',
      });
    }
  }
  return results;
}

// Browser-based search fallback — calls browse_search from browser.js
async function _searchBrowser(query, limit) {
  const { browse_search } = require('./browser');
  const result = await browse_search({ query, engine: 'duckduckgo', max_results: limit });
  if (result.error) throw new Error(result.error);
  if (!result.results?.length) throw new Error('Browser search returned no results');
  return result.results;
}

/**
 * Backend 2: Tavily Search API
 * Free tier: 1,000 queries/month
 * Get key at: https://tavily.com → Dashboard
 * Set TAVILY_API_KEY in .env
 *
 * Advantage over Brave: returns extracted full text per result (better for AI)
 * and includes an AI-generated answer summary.
 */
async function _searchTavily(query, limit) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null; // not configured — skip silently

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: limit,
      include_answer: true,   // AI summary of results
      search_depth: 'basic',  // 'advanced' costs 2 credits
    }),
    signal: AbortSignal.timeout(TOOL_CONSTANTS.HTTP_DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Tavily: ${res.status} ${body.slice(0, 100)}`);
  }
  const data = await res.json();

  const results = (data.results || []).map(r => ({
    title: r.title,
    snippet: r.content || r.raw_content?.slice(0, 300) || '',
    url: r.url,
    source: 'Tavily',
  }));

  // Prepend AI answer as first result if available
  if (data.answer && data.answer.trim()) {
    results.unshift({
      title: `AI Answer`,
      snippet: data.answer.slice(0, 500),
      url: '',
      source: 'Tavily AI',
    });
  }

  return results;
}

// ─── search_web ───────────────────────────────────────────────────────────────

async function search_web({ query, max_results = TOOL_CONSTANTS.SEARCH_DEFAULT_RESULTS }) {
  const limit = Math.min(max_results, TOOL_CONSTANTS.SEARCH_MAX_RESULTS);

  const backends = [
    { name: 'Brave Search',            fn: () => _searchBrave(query, limit) },
    { name: 'Tavily',                  fn: () => _searchTavily(query, limit) },
    { name: 'DuckDuckGo HTML',         fn: () => _searchDDGHtml(query, limit) },
    { name: 'DuckDuckGo Instant',      fn: () => _searchDDGInstant(query, limit) },
    { name: 'Browser (agent-browser)', fn: () => _searchBrowser(query, limit) },
  ];

  for (const backend of backends) {
    try {
      const results = await backend.fn();
      if (results && results.length > 0) {
        logger.debug('tools:search', `${results.length} results via ${backend.name}`);
        return {
          query,
          backend: backend.name,
          results: results.slice(0, limit),
          count: results.length,
        };
      }
    } catch (e) {
      logger.debug('tools:search', `${backend.name} failed — ${e.message}`);
    }
  }

  return {
    query,
    results: [],
    note: [
      'All search backends failed.',
      !process.env.BRAVE_API_KEY && !process.env.TAVILY_API_KEY
        ? 'Set BRAVE_API_KEY or TAVILY_API_KEY in .env for reliable search.'
        : null,
      'Or: npm install -g agent-browser for browser-based search.',
    ].filter(Boolean).join(' '),
  };
}

module.exports = { http_request, search_web };