# Yuchi 的博客

基于 VitePress 1.6.4 和 Vue 3 的个人博客。首页、技术、随笔和关于是四个一级入口。

## 本地运行

使用 Node.js 24 和 npm。

```sh
npm ci
npm run dev
```

`npm run build` 生成静态文件到 `docs/.vitepress/dist`，`npm run preview` 预览生产构建。

## 发布文章

把已确认公开的 Markdown 放进 `docs/tech/` 或 `docs/essay/`，使用英文短横线文件名，例如 `first-post.md`。未发布的文章可以放在项目根目录的 `drafts/`。

```md
---
title: 文章标题
date: "2026-11-09"
description: 一句话摘要
---

# 文章标题

## 第一节

从这里开始写正文。
```

栏目标签从目录自动生成，发布日期读取 `date`，更新日期读取最后一次 Git 提交（本地未提交时使用发布日期）。首页列表、栏目列表、相邻文章和站内搜索随构建更新。写公式可以使用 `$...$` 和 `$$...$$`，画图可以用 `mermaid` 围栏代码块。

## 部署

仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。向 `main` 推送时，工作流会自动构建并发布。

### 绑定 yuchi.cn

先在 GitHub 账号设置中验证域名，再在仓库的 **Settings → Pages → Custom domain** 填写 `yuchi.cn`。在 DNS 服务商处配置 GitHub Pages 所需的记录，等 Pages 显示 DNS 验证通过后开启 **Enforce HTTPS**。通过 Actions 部署时，由 Pages 设置管理自定义域名。工作流使用 Pages 提供的 URL 更新站点地图，绑定完成后可以手动重新运行工作流。

[GitHub Pages 自定义域名说明](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)

## 参考

首页和文章布局参考 [MinmusLin's Blog](https://www.minmuslin.cn/) 及其 [VitePress 源码](https://github.com/MinmusLin/MinmusLin.github.io)。
