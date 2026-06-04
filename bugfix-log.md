# Bugfix Log - PeyBlog Cloudflare Worker

记录日期：2026-06-05

---

## 问题背景

Cloudflare Pages Functions 在**无构建静态站点**中不工作（所有 `/api/*` 返回 404），导致点赞数据无法通过服务端持久化，跨设备点赞数据丢失。

解决方案：创建独立 Cloudflare Worker (`peyblog-likes-api`) 处理 API 请求。

---

## Bug #1 — `comments_count` 字段名错误

**位置**：`worker.js` `handleGetDiscussions()` 第 234 行（旧）

**现象**：`/api/discussions` 返回的所有文章评论数都是 `0`

**根因**：GitHub Discussions REST API 返回的字段名是 `comments`，不是 `comments_count`

**修复**：
```js
// 修复前：
commentCounts[discussion.title] = discussion.comments_count || 0;

// 修复后：
const slug = (d.title || '').replace(/^#\/post\//, '');
commentCounts[slug] = d.comments || 0;
```

**验证结果**（2026-06-05 00:30）：
- [ ] 待验证（需用户更新 Worker 代码后测试）

---

## Bug #2 — 讨论标题前缀未去除

**位置**：`worker.js` `handleGetDiscussions()` 

**现象**：返回的 key 是 `#/post/info-and-knowledge`，前端用 `info-and-knowledge` 匹配，导致评论数永远为 0

**根因**：GitHub Discussion 标题格式为 `#/post/{slug}`，未去除前缀

**修复**：
```js
// 修复后：
const slug = (d.title || '').replace(/^#\/post\//, '');
commentCounts[slug] = d.comments || 0;
```

**验证结果**（2026-06-05 00:30）：
- [ ] 待验证

---

## Bug #3 — Worker 返回格式与前端期望不匹配

**位置**：`index.html` `fetchArticleCommentCounts()` 第 1117 行

**现象**：前端 `data.articles` 取不到值，评论数不显示

**根因**：
- Worker 返回扁平格式：`{ "info-and-knowledge": 1, ... }`
- 前端期望嵌套格式：`{ articles: {...}, total: 0 }`

**修复**：
```js
// 修复前：
articleCommentCounts = data.articles || {};
totalCommentCount = data.total || 0;

// 修复后：
articleCommentCounts = data || {};
totalCommentCount = Object.values(articleCommentCounts).reduce((s, v) => s + (v || 0), 0);
```

**验证结果**（2026-06-05 00:30）：
- [ ] 待验证

---

## Bug #4 — POST 契约完全不一致（严重）

**位置**：`index.html` `syncLikesToGithub()` 第 847 行 + `worker.js` `handlePostLikes()` 第 115 行

**现象**：点赞 POST 请求永远返回 400，点赞数据从未成功写入 GitHub

**根因**：
| | 前端发送 | Worker 期望 |
|---|---|---|
| Body | `{ likes: {"slug": 1, ...} }` | `{ articleId: "...", action: "like/unlike" }` |

**修复方案**：修改 Worker 支持两种格式
```js
// Worker 现在支持两种格式：
// 1. { likes: {...} } - 完整同步（来自前端 syncLikesToGithub）
// 2. { articleId, action } - 单次点赞/取消
if (body.likes && typeof body.likes === 'object') {
  currentData = body.likes;
} else if (body.articleId && body.action) {
  // single like/unlike
}
```

**验证结果**（2026-06-05 00:30）：
- [ ] 待验证（需用户更新 Worker 代码后测试跨设备点赞）

---

## Bug #5 — 点赞数据格式冲突（严重）

**位置**：`worker.js` `handlePostLikes()` 第 148-157 行 + `index.html` `getArticleLikes()` 第 883 行

**现象**：Worker 写入嵌套格式 `{slug: {count: 1, users: []}}`，前端直接 `likes[slug]` 拿到对象而非数字

**根因**：
- 现有 `likes.json` 是扁平格式：`{ "slug": 1 }`
- Worker 写入嵌套格式：`{ "slug": {count: 1} }`
- 前端 `getArticleLikes(slug)` 直接 `return likes[slug]` → 得到对象 `{count: 1}` 而非数字

**修复**：Worker 写入扁平格式
```js
// 修复前：
if (!currentData[articleId]) {
  currentData[articleId] = { count: 0, users: [] };
}
currentData[articleId].count = (currentData[articleId].count || 0) + 1;

// 修复后：
if (action === 'like') {
  currentData[body.articleId] = (currentData[body.articleId] || 0) + 1;
} else if (action === 'unlike') {
  currentData[body.articleId] = Math.max(0, (currentData[body.articleId] || 0) - 1);
}
```

**验证结果**（2026-06-05 00:30）：
- [ ] 待验证

---

## 综合验证步骤

完成上述修复后，按以下步骤验证：

### 1. 验证 Worker `/api/likes` (GET)
```bash
curl https://peyblog-likes-api.peyw.workers.dev/api/likes
```
期望：返回扁平格式 JSON，如 `{"info-and-knowledge": 1, "start-blogging": 0}`

### 2. 验证 Worker `/api/discussions` (GET)
```bash
curl https://peyblog-likes-api.peyw.workers.dev/api/discussions
```
期望：返回扁平格式 JSON，key 为 slug（无 `#/post/` 前缀）

### 3. 验证点赞跨设备持久化
1. 设备 A：打开 `https://peyblog.com`，点击某篇文章的点赞按钮
2. 设备 B（或无痕模式）：打开同一篇文章，点赞数应已更新
3. 检查 `https://raw.githubusercontent.com/YankeeDaddy/My-Blog-CF/main/posts/likes.json` 是否已更新

---

## 修复汇总

| Bug | 严重度 | 状态 | 验证状态 |
|-----|--------|------|-----------|
| #1 comments 字段名 | 🟡 中 | ✅ 已修复 | ⏳ 待验证 |
| #2 标题前缀 | 🟡 中 | ✅ 已修复 | ⏳ 待验证 |
| #3 返回格式不匹配 | 🟡 中 | ✅ 已修复 | ⏳ 待验证 |
| #4 POST 契约不一致 | 🔴 高 | ✅ 已修复 | ⏳ 待验证 |
| #5 数据格式冲突 | 🔴 高 | ✅ 已修复 | ⏳ 待验证 |

---

## 待办

- [ ] 用户需在 Cloudflare Dashboard 更新 Worker 代码（复制 `worker.js` 内容）
- [ ] 验证 `/api/likes` 端点
- [ ] 验证 `/api/discussions` 端点  
- [ ] 验证跨设备点赞持久化
- [ ] 更新验证结果到本文件
