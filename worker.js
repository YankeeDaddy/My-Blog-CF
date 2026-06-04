// Cloudflare Worker for PeyBlog API
// Handles likes and discussions (comments count) APIs
// Deploy this as a standalone Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS request (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }
    
    // Route: /api/likes
    if (path === '/api/likes' || path.endsWith('/api/likes')) {
      if (request.method === 'GET') {
        return await handleGetLikes(env, corsHeaders);
      } else if (request.method === 'POST') {
        return await handlePostLikes(request, env, corsHeaders);
      }
    }
    
    // Route: /api/discussions
    if (path === '/api/discussions' || path.endsWith('/api/discussions')) {
      if (request.method === 'GET') {
        return await handleGetDiscussions(env, corsHeaders);
      }
    }
    
    // 404 for all other routes
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders,
    });
  }
};

// GET /api/likes - Fetch likes from GitHub
async function handleGetLikes(env, corsHeaders) {
  const repo = 'YankeeDaddy/My-Blog-CF';
  const path = 'posts/likes.json';
  const apiUrl = `https://raw.githubusercontent.com/${repo}/main/${path}?t=${Date.now()}`;
  
  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
    if (!response.ok) {
      // If file doesn't exist yet, return empty object
      if (response.status === 404) {
        return new Response(JSON.stringify({}), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error fetching likes:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch likes' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

// POST /api/likes - Update likes on GitHub
async function handlePostLikes(request, env, corsHeaders) {
  const GITHUB_PAT = env.GITHUB_PAT;
  
  if (!GITHUB_PAT) {
    return new Response(JSON.stringify({ error: 'GitHub PAT not configured' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
  
  const repo = 'YankeeDaddy/My-Blog-CF';
  const path = 'posts/likes.json';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  
  try {
    const body = await request.json();
    const { articleId, action } = body;
    
    if (!articleId || !action) {
      return new Response(JSON.stringify({ error: 'Missing articleId or action' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
    
    // 1. Get current file content and SHA
    const getResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    let currentData = {};
    let sha = null;
    
    if (getResponse.ok) {
      const getData = await getResponse.json();
      sha = getData.sha;
      const content = getData.content;
      const decodedContent = atob(content.replace(/\n/g, ''));
      currentData = JSON.parse(decodedContent);
    } else if (getResponse.status !== 404) {
      throw new Error(`GitHub API error: ${getResponse.status}`);
    }
    
    // 2. Update likes count
    if (!currentData[articleId]) {
      currentData[articleId] = { count: 0, users: [] };
    }
    
    if (action === 'like') {
      currentData[articleId].count = (currentData[articleId].count || 0) + 1;
    } else if (action === 'unlike') {
      currentData[articleId].count = Math.max(0, (currentData[articleId].count || 0) - 1);
    }
    
    // 3. Commit updated file to GitHub
    const jsonStr = JSON.stringify(currentData, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));
    
    const putBody = {
      message: `Update likes for ${articleId}`,
      content: base64Content,
      branch: 'main',
    };
    
    if (sha) {
      putBody.sha = sha;
    }
    
    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(putBody),
    });
    
    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(`GitHub API error: ${putResponse.status} - ${errorText}`);
    }
    
    return new Response(JSON.stringify({ success: true, count: currentData[articleId].count }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('Error updating likes:', error);
    return new Response(JSON.stringify({ error: 'Failed to update likes', details: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

// GET /api/discussions - Fetch comment counts from GitHub Discussions (REST API)
async function handleGetDiscussions(env, corsHeaders) {
  const GITHUB_PAT = env.GITHUB_PAT;
  const repo = 'YankeeDaddy/My-Blog-Comments-CF';

  try {
    // Use REST API to list discussions with comments_count
    const url = `https://api.github.com/repos/${repo}/discussions?per_page=100`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT || ''}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'peyblog-worker',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub REST error: ${response.status} ${text}`);
    }

    const discussions = await response.json();

    // Transform to { articleId: commentCount } format
    const commentCounts = {};
    discussions.forEach(discussion => {
      // discussion.title stores the articleId (slug)
      commentCounts[discussion.title] = discussion.comments_count || 0;
    });

    return new Response(JSON.stringify(commentCounts), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch discussions',
      detail: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
