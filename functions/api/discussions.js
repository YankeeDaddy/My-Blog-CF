/**
 * Cloudflare Pages Function — /api/discussions
 * 
 * 代理 GitHub Discussions API，用服务端认证避免匿名 API 的 60 req/hr 限制。
 * 需要环境变量 GITHUB_PAT（可选，加后速率上限 5000/hr；不加则 60/hr）。
 * 
 * GET /api/discussions  → 返回所有 discussions 的评论数统计
 */

const OWNER = 'YankeeDaddy';
const COMMENTS_REPO = 'My-Blog-Comments-CF';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const url = `https://api.github.com/repos/${OWNER}/${COMMENTS_REPO}/discussions?per_page=100&state=all`;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-Pages-Function',
  };
  // Use PAT if configured (bumps rate limit from 60 → 5000 req/hr)
  if (env.GITHUB_PAT) {
    headers['Authorization'] = `token ${env.GITHUB_PAT}`;
  }

  try {
    const resp = await fetch(url, { headers, cf: { cacheTtl: 60 } });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`GitHub API returned ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const discussions = await resp.json();

    // Return compact format: { "slug": commentCount, ... } + total
    const result = { articles: {}, total: 0 };
    if (Array.isArray(discussions)) {
      discussions.forEach(d => {
        const match = d.title && d.title.match(/^#\/post\/(.+)$/);
        if (match) {
          result.articles[match[1]] = d.comments || 0;
          result.total += (d.comments || 0);
        }
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, articles: {}, total: 0 }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}
