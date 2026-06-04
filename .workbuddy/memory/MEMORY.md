# 项目长期记忆 — myblog-cloudflare

## 项目性质
PeyBlog 的 Cloudflare Pages 托管方案，从 Netlify 版迁移而来。

## GitHub 仓库
- **主仓库**：`YankeeDaddy/My-Blog-CF` — 存储 index.html、posts/*.md、_headers
- **评论仓库**：`YankeeDaddy/My-Blog-Comments-CF` — Giscus 评论，待开启 Discussions

## 技术架构
- 纯静态单页应用（SPA），零构建依赖
- 单文件博客：index.html（HTML + CSS + JS 全内联，约 1900 行）
- 文章存储：posts/*.md + posts/index.json（元数据索引）
- 部署：Cloudflare Pages，直接托管根目录，无构建步骤
- 评论：Giscus（GitHub Discussions）
- 写作流程：浏览器编辑器 → GitHub Contents API → 触发 Cloudflare Pages 重新部署

## 与 Netlify 版对比
| 项目 | Netlify 版 | 本项目（CF 版） |
|------|-----------|----------------|
| 配置文件 | netlify.toml | _headers |
| 主仓库 | My-Blog | My-Blog-CF |
| 评论仓库 | My-Blog-Comments | My-Blog-Comments-CF |

## 待完成事项（用户手动操作）
1. Cloudflare Dashboard 连接 My-Blog-CF，创建 Pages 项目（无构建命令）
2. My-Blog-Comments-CF 开启 Discussions + 安装 Giscus App
3. 从 giscus.app 获取 repoId/categoryId → 填入 index.html GISCUS_CONFIG（约第 1264 行）
4. 推送变更触发重新部署
