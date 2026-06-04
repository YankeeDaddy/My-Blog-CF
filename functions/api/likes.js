/**
 * Cloudflare Pages Function — /api/likes
 * 
 * 服务端代理点赞数据的读写，绕过 CF CDN 缓存。
 * 写入需要环境变量 GITHUB_PAT（在 CF Pages Settings → Environment variables 中设置）。
 * 
 * GET  /api/likes     → 从 GitHub raw 读取 likes.json（始终最新）
 * POST /api/likes     → 将点赞数据写入 GitHub（需 GITHUB_PAT）
 */

const OWNER = 'YankeeDaddy';
const REPO  = 'My-Blog-CF';
const BRANCH = 'main';
const FILE_PATH = 'posts/likes.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env } = context;

  // --- CORS preflight ---
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // --- GET: read likes.json from GitHub raw ---
  if (request.method === 'GET') {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`;
    try {
      const resp = await fetch(url, {
        // cf: { cacheTtl: 0 } ensures Cloudflare edge doesn't cache this upstream fetch
        cf: { cacheTtl: 0 },
      });
      if (!resp.ok) throw new Error(`GitHub raw returned ${resp.status}`);
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: `Failed to fetch likes: ${e.message}` }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  // --- POST: write likes.json to GitHub ---
  if (request.method === 'POST') {
    const token = env.GITHUB_PAT;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Server not configured: GITHUB_PAT missing' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const likesData = body.likes;
    if (!likesData || typeof likesData !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing or invalid "likes" field' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
    const authHeaders = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Pages-Function',
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
        message: '👍 更新点赞数据 [via API]',
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
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
