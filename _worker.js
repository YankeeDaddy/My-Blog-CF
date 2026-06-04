/**
 * Cloudflare Pages Worker — API routes + static file passthrough
 */
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // --- GET /api/likes ---
      if (path === '/api/likes' && request.method === 'GET') {
        const rawResp = await fetch(
          'https://raw.githubusercontent.com/YankeeDaddy/My-Blog-CF/main/posts/likes.json',
          { cf: { cacheTtl: 0 } }
        );
        const data = await rawResp.json();
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
        });
      }

      // --- POST /api/likes ---
      if (path === '/api/likes' && request.method === 'POST') {
        const token = env.GITHUB_PAT;
        if (!token) {
          return new Response(JSON.stringify({ error: 'GITHUB_PAT missing' }), {
            status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
        const body = await request.json();
        const likes = body.likes;
        if (!likes || typeof likes !== 'object') {
          return new Response(JSON.stringify({ error: 'Invalid likes' }), {
            status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        const apiBase = 'https://api.github.com/repos/YankeeDaddy/My-Blog-CF/contents/posts/likes.json';
        const auth = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CF-Pages' };

        const getResp = await fetch(apiBase, { headers: auth });
        let sha = null;
        if (getResp.ok) {
          const info = await getResp.json();
          sha = info.sha;
        } else if (getResp.status !== 404) {
          throw new Error('GitHub GET ' + getResp.status);
        }

        const content = JSON.stringify(likes, null, 2) + '\n';
        const putBody = { message: 'Update likes', content: btoa(unescape(encodeURIComponent(content))), branch: 'main' };
        if (sha) putBody.sha = sha;

        const putResp = await fetch(apiBase, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
          body: JSON.stringify(putBody),
        });

        if (!putResp.ok) {
          const txt = await putResp.text();
          throw new Error('GitHub PUT ' + putResp.status + ': ' + txt.slice(0, 200));
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // --- GET /api/discussions ---
      if (path === '/api/discussions') {
        const token = env.GITHUB_PAT;
        const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CF-Pages' };
        if (token) headers['Authorization'] = 'token ' + token;

        const resp = await fetch(
          'https://api.github.com/repos/YankeeDaddy/My-Blog-Comments-CF/discussions?per_page=100&state=all',
          { headers }
        );
        if (!resp.ok) throw new Error('GitHub API ' + resp.status);
        const discussions = await resp.json();
        const articles = {};
        let total = 0;
        (discussions || []).forEach(function(d) {
          var m = d.title && d.title.match(/^#\/post\/(.+)$/);
          if (m) { articles[m[1]] = d.comments || 0; total += d.comments || 0; }
        });
        return new Response(JSON.stringify({ articles: articles, total: total }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
        });
      }

      // --- OPTIONS preflight ---
      if (path.startsWith('/api/') && request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      // --- Static files ---
      return env.ASSETS.fetch(request);

    } catch (e) {
      return new Response(JSON.stringify({ error: 'Worker error: ' + (e.message || 'unknown') }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
