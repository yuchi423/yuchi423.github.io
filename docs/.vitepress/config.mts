import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { articleSection, sections } from './sections'

const siteUrl = process.env.BLOG_SITE_URL || 'https://yuchi423.github.io'
const base = process.env.BLOG_BASE || '/'

export default withMermaid(defineConfig({
  lang: 'zh-CN',
  title: 'Yuchi 的博客',
  description: '记录技术学习、项目实践和日常思考。',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]],
  sitemap: { hostname: siteUrl },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: sections.tech.label, link: sections.tech.link, activeMatch: '^/tech/' },
      { text: sections.essay.label, link: sections.essay.link, activeMatch: '^/essay/' },
      { text: '关于', link: '/about' }
    ],
    sidebar: {
      '/tech/': [{ text: '技术文章', link: sections.tech.link }],
      '/essay/': [{ text: '随笔文章', link: sections.essay.link }]
    },
    outline: { level: [2, 4], label: '目录' },
    docFooter: { prev: false, next: false },
    lastUpdated: { text: '更新于' },
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色主题',
    darkModeSwitchTitle: '切换到深色主题',
    skipToContentLabel: '跳转到正文',
    notFound: {
      title: '页面未找到',
      quote: '这个地址没有对应的页面。',
      linkLabel: '返回首页',
      linkText: '返回首页'
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/yuchi423' }],
    footer: { copyright: `Copyright © ${new Date().getFullYear()} Yuchi` },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文章', buttonAriaLabel: '搜索文章' },
          modal: {
            displayDetails: '展开详情',
            resetButtonTitle: '清除搜索',
            backButtonTitle: '返回',
            noResultsText: '没有找到相关内容',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    }
  },
  markdown: {
    math: true,
    lineNumbers: true,
    image: { lazyLoading: true },
    container: { tipLabel: '提示', infoLabel: '说明', warningLabel: '注意', dangerLabel: '警告', detailsLabel: '详情' },
    config(md) {
      md.core.ruler.push('blog-article-meta', state => {
        if (!articleSection(state.env.relativePath ?? '')) return

        const titleEnd = state.tokens.findIndex(token => token.type === 'heading_close' && token.tag === 'h1')
        if (titleEnd === -1) return

        const metadata = new state.Token('html_block', '', 0)
        metadata.content = '<ArticleMeta />\n'
        state.tokens.splice(titleEnd + 1, 0, metadata)
      })
    }
  },
  mermaid: { securityLevel: 'strict' }
}))
