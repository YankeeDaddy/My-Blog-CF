# PeyBlog — Cloudflare Pages 版

这是 PeyBlog 的 **Cloudflare Pages** 托管方案，从 Netlify 版迁移而来。

## 仓库说明

本项目使用两个 GitHub 仓库：

| 仓库 | 用途 |
|------|------|
| `YankeeDaddy/My-Blog-CF` | **主仓库**（即本仓库）：存储 `index.html`、`posts/*.md`、配置文件等 |
| `YankeeDaddy/My-Blog-Comments-CF` | **评论仓库**：专供 Giscus 评论系统使用（GitHub Discussions） |

> **与 Netlify 版的关系**：原来的 `YankeeDaddy/My-Blog`（Netlify）和 `YankeeDaddy/My-Blog-Comments`（Giscus）两个仓库保持不变，本项目是独立的 Cloudflare Pages 方案。

---

## 部署到 Cloudflare Pages

### 一、连接 GitHub 仓库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. 选择 `YankeeDaddy/My-Blog-CF` 仓库
4. 构建配置如下：

| 配置项 | 值 |
|--------|-----|
| 构建命令 | *(留空，无需构建)* |
| 构建输出目录 | `/`（根目录）或留空 |
| 根目录 | *(留空)* |

5. 点击 **Save and Deploy**

每次向 `main` 分支推送，Cloudflare Pages 会自动触发重新部署。

---

## 配置评论系统（Giscus）

Giscus 使用 GitHub Discussions 存储评论，需要单独配置。

### 1. 创建评论仓库

在 GitHub 创建仓库 `My-Blog-Comments-CF`，并：
- 在仓库设置中开启 **Discussions** 功能
- 安装 [Giscus App](https://github.com/apps/giscus)，授权该仓库

### 2. 获取 Giscus 配置参数

访问 [https://giscus.app](https://giscus.app)，填入 `YankeeDaddy/My-Blog-Comments-CF`，获取：
- `data-repo-id`（repoId）
- `data-category-id`（categoryId）

### 3. 更新 index.html

打开 `index.html`，找到 `GISCUS_CONFIG` 部分（约第 1264 行），填入实际的 ID：

```javascript
const GISCUS_CONFIG = {
    repo: 'YankeeDaddy/My-Blog-Comments-CF',
    repoId: 'R_xxxxxxxxxx',      // ← 填入实际值
    category: 'Announcements',
    categoryId: 'DIC_xxxxxxxxxx', // ← 填入实际值
    // ...
};
```

---

## 写作流程

博客内置了一个浏览器编辑器，通过 GitHub Contents API 直接推送文章。

### 1. 进入管理模式

访问博客 URL，末尾加上 `?edit=1`：
```
https://peyblog.com/?edit=1
```

### 2. 配置 GitHub Token

首次进入管理模式后，在侧边栏点击 **配置 Token**，填入：
- **Personal Access Token**：需有 `repo` 权限（[点击生成](https://github.com/settings/tokens/new?scopes=repo&description=Blog+Editor)）
- **仓库地址**：`YankeeDaddy/My-Blog-CF`
- **分支**：`main`

### 3. 写文章

点击导航栏的 **✏️ 写文章**，填写标题、分类、标签，在双栏编辑器中用 Markdown 写作，点击 **🚀 发布文章到 GitHub** 即可。

文章发布后，GitHub 仓库收到 commit，Cloudflare Pages 自动触发重新部署（约 30 秒上线）。

---

## 项目结构

```
.
├── index.html          # 博客核心（单页应用，含 HTML/CSS/JS）
├── posts/
│   ├── index.json      # 文章元数据索引
│   ├── likes.json      # 文章点赞数据
│   └── *.md            # 文章正文（Markdown）
├── _headers            # Cloudflare Pages HTTP 响应头配置
├── .gitignore
└── README.md
```

---

## 与 Netlify 版的差异

| 特性 | Netlify 版 | Cloudflare Pages 版 |
|------|-----------|----------------------|
| 配置文件 | `netlify.toml` | `_headers` |
| HTTP Headers | `[[headers]]` 语法 | `_headers` 文件语法 |
| 构建命令 | 无（直接托管） | 无（直接托管） |
| 发布目录 | `.`（根目录） | 根目录（默认） |
| 主仓库 | `My-Blog` | `My-Blog-CF` |
| 评论仓库 | `My-Blog-Comments` | `My-Blog-Comments-CF` |
| 部署平台 | Netlify | Cloudflare Pages |

两个方案的核心代码（`index.html`）完全相同，仅以下内容有变化：
1. `GISCUS_CONFIG.repo` 指向不同的评论仓库
2. About 页中的"部署"显示为"Cloudflare Pages"
3. GitHub Config Panel 提示文字更新为 Cloudflare Pages
