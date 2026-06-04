# 部署独立 Cloudflare Worker 指南

## 问题描述
Cloudflare Pages Functions（`functions/` 目录）在**无构建命令的静态站点**中不工作，所有 `/api/*` 请求返回 404。

## 解决方案
创建独立的 Cloudflare Worker 来处理 API 请求。

## 部署步骤

### 1. 创建 Worker
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **Create Application**
3. 选择 **Create Worker**
4. 输入 Worker 名称：`peyblog-likes-api`
5. 点击 **Deploy**

### 2. 配置 Worker 代码
1. 在 Worker 详情页，点击 **Edit Code**
2. 删除默认代码，复制 `worker.js` 的全部内容
3. 粘贴到代码编辑器
4. 点击 **Save and Deploy**

### 3. 设置环境变量
1. 在 Worker 详情页，进入 **Settings** → **Variables**
2. 点击 **Add Variable**
3. 变量名：`GITHUB_PAT`
4. 变量值：你的 GitHub Personal Access Token（需要 `repo` 权限）
   - 创建 PAT：https://github.com/settings/tokens
   - 勾选 `repo` 权限
5. 点击 **Save and Deploy**

### 4. 验证 Worker
部署成功后，Worker 的 URL 会是：
```
https://peyblog-likes-api.peyw.workers.dev
```

测试以下端点：
- `GET https://peyblog-likes-api.peyw.workers.dev/api/likes` — 应该返回 JSON
- `GET https://peyblog-likes-api.peyw.workers.dev/api/discussions` — 应该返回 JSON

### 5. 博客配置（已完成）
`index.html` 中已添加：
```javascript
const API_BASE = 'https://peyblog-likes-api.peyw.workers.dev';
```

所有 API 调用已更新为使用 `${API_BASE}/api/likes` 和 `${API_BASE}/api/discussions`。

### 6. 验证跨设备持久化
1. 在设备 A 上点赞一篇文章
2. 等待 5-10 秒（GitHub API 有缓存延迟）
3. 在设备 B 上打开同一篇文章
4. 应该能看到更新的点赞数

## 故障排除
- **404 错误**：检查 Worker 是否已部署成功
- **500 错误**：检查 `GITHUB_PAT` 环境变量是否正确设置
- **401 错误**：检查 GitHub PAT 是否有 `repo` 权限
- **CORS 错误**：Worker 代码已包含 CORS 头部，如果还有问题，检查 Worker 是否正确保存

## 文件说明
- `worker.js`：独立的 Cloudflare Worker 代码，处理点赞和评论数 API
- `index.html`：博客主文件，已配置使用 Worker API
- `_worker.js`：**已删除**（Pages Worker 在无构建静态站点中不工作）
- `functions/`：**已删除**（Pages Functions 在无构建静态站点中不工作）
