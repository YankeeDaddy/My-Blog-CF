// Cloudflare Worker for PeyBlog API
// Handles likes and discussions (comments count) APIs
// Deploy this as a standalone Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === '/api/likes' || path.endsWith('/api/likes')) {
      if (request.method === 'GET') return await handleGetLikes(env, corsHeaders);
      if (request.method === 'POST') return await handlePostLikes(request, env, corsHeaders);
    }

    if (path === '/api/discussions' || path.endsWith('/api/discussions')) {
      if (request.method === 'GET') return await handleGetDiscussions(env, corsHeaders);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

async function handleGetLikes(env, corsHeaders) {
  const repo = 'YankeeDaddy/My-Blog-CF';
  const apiUrl = `https://raw.githubusercontent.com/${repo}/main/posts/likes.json?t=${Date.now()}`;
  try {
    const response = await fetch(apiUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) {
      if (response.status === 404) {
        return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch likes', detail: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handlePostLikes(request, env, corsHeaders) {
  const GITHUB_PAT = env.GITHUB_PAT;
  if (!GITHUB_PAT) {
    return new Response(JSON.stringify({ error: 'GitHub PAT not configured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const repo = 'YankeeDaddy/My-Blog-CF';
  const path = 'posts/likes.json';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

  try {
    const body = await request.json();
    let currentData = {};
    let sha = null;

    // GET 不需要 PAT（公开仓库），只在写入时使用 PAT
    const getResponse = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'peyblog-worker' },
    });

    if (getResponse.ok) {
      const getData = await getResponse.json();
      sha = getData.sha;
      currentData = JSON.parse(atob(getData.content.replace(/\n/g, '')));
    } else if (getResponse.status !== 404) {
      throw new Error(`GitHub GET error: ${getResponse.status}`);
    }

    // Case 1: full sync { likes: { slug: number, ... } }
    if (body.likes && typeof body.likes === 'object') {
      currentData = body.likes;
    }
    // Case 2: single like/unlike { articleId, action }
    else if (body.articleId && body.action) {
      if (body.action === 'like') {
        currentData[body.articleId] = (currentData[body.articleId] || 0) + 1;
      } else if (body.action === 'unlike') {
        currentData[body.articleId] = Math.max(0, (currentData[body.articleId] || 0) - 1);
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Commit flat format { slug: number } to GitHub
    const jsonStr = JSON.stringify(currentData, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));

    const putBody = { message: 'Update likes data', content: base64Content, branch: 'main' };
    if (sha) putBody.sha = sha;

    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_PAT}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    });

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`GitHub PUT error: ${putResponse.status} - ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true, likes: currentData }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to update likes', detail: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleGetDiscussions(env, corsHeaders) {
  const GITHUB_PAT = env.GITHUB_PAT;
  const repo = 'YankeeDaddy/My-Blog-Comments-CF';
  try {
    const url = `https://api.github.com/repos/${repo}/discussions?per_page=100`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${GITHUB_PAT || ''}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'peyblog-worker' },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub REST error: ${response.status} ${text}`);
    }

    const discussions = await response.json();
    const commentCounts = {};
    discussions.forEach(d => {
      const slug = (d.title || '').replace(/^#\/post\//, '');
      commentCounts[slug] = d.comments || 0;
    });

    return new Response(JSON.stringify(commentCounts), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch discussions', detail: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}
