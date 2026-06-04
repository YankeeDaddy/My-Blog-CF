/**
 * Cloudflare Pages Worker — handles API routes, static files passthrough
 * 
 * Routes:
 *   GET  /api/likes       → read likes.json from GitHub
 *   POST /api/likes       → write likes.json to GitHub (needs GITHUB_PAT env var)
 *   GET  /api/discussions → read comment counts from GitHub Discussions API
 *   *    /*               → serve static files (index.html, posts/, etc.)
 */

const OWNER = 'YankeeDaddy';
const REPO  = 'My-Blog-CF';
const BRANCH = 'main';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API: likes ---
    if (path === '/api/likes') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.method === 'GET') {
        return handleGetLikes();
      }
      if (request.method === 'POST') {
        return handlePostLikes(request, env);
      }
      return new Response('Method Not Allowed', { status: 405, headers: CORS });
    }

    // --- API: discussions ---
    if (path === '/api/discussions') {
      const commentsRepo = 'YankeeDaddy/My-Blog-Comments-CF';
      const token = env.GITHUB_PAT;
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Cloudflare-Pages-Worker',
      };
      if (token) {
        headers['Authorization'] = `token ${token}`;
      }
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${commentsRepo}/discussions?per_page=100&state=all`,
          { headers }
        );
        if (!resp.ok) throw new Error(`GitHub API returned ${resp.status}`);
        const discussions = await resp.json();
        if (!Array.isArray(discussions)) throw new Error('Unexpected response');
        const articles = {};
        let total = 0;
        discussions.forEach(d => {
          const match = d.title && d.title.match(/^#\/post\/(.+)$/);
          if (match) {
            articles[match[1]] = d.comments || 0;
            total += (d.comments || 0);
          }
        });
        return new Response(JSON.stringify({ articles, total }), {
          headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // --- Everything else: serve static files ---
    return env.ASSETS.fetch(request);
  },
};

async function handleGetLikes() {
  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/posts/likes.json`;
  try {
    const resp = await fetch(rawUrl, { cf: { cacheTtl: 0 } });
    if (!resp.ok) throw new Error(`GitHub raw returned ${resp.status}`);
    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Failed to fetch likes: ${e.message}` }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}

async function handlePostLikes(request, env) {
  const token = env.GITHUB_PAT;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Server not configured: GITHUB_PAT missing' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const likesData = body.likes;
  if (!likesData || typeof likesData !== 'object') {
    return new Response(JSON.stringify({ error: 'Missing or invalid "likes" field' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/posts/likes.json`;
  const authHeaders = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Cloudflare-Pages-Worker',
  };

  try {
    // Step 1: get current SHA
    const getResp = await fetch(apiBase, { headers: authHeaders });
    if (!getResp.ok && getResp.status !== 404) {
      const txt = await getResp.text();
      throw new Error(`GitHub GET returned ${getResp.status}: ${txt.slice(0, 200)}`);
    }
    const fileInfo = getResp.status === 404 ? null : await getResp.json();

    // Step 2: PUT updated content
    const content = JSON.stringify(likesData, null, 2) + '\n';
    const putBody = {
      message: '\uD83D\uDC4D Update likes [via API]',
      content: btoa(unescape(encodeURIComponent(content))),
      branch: BRANCH,
    };
    if (fileInfo && fileInfo.sha) {
      putBody.sha = fileInfo.sha;
    }

    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    });

    if (!putResp.ok) {
      const txt = await putResp.text();
      throw new Error(`GitHub PUT returned ${putResp.status}: ${txt.slice(0, 200)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}
