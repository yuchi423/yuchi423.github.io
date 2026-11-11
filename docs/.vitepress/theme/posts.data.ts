import { createContentLoader } from 'vitepress'
import type { ContentData } from 'vitepress'
import { articleSection, type Section } from '../sections'

export interface Post {
  url: string
  section: Section
  title: string
  description: string
  date: string
  minutes: number
  wordCount: number
}

declare const data: Post[]
export { data }

function readingStats(source: string) {
  const prose = source
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1[^\S\r\n]*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  const hanCount = (prose.match(/\p{Script=Han}/gu) ?? []).length
  const otherWordCount = (prose.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length
  return {
    wordCount: hanCount + otherWordCount,
    minutes: Math.max(1, Math.ceil(hanCount / 350 + otherWordCount / 200))
  }
}

function toPost({ url, frontmatter, src = '' }: ContentData): Post | undefined {
  const section = articleSection(`${url.slice(1).replace(/\.html$/, '')}.md`)
  if (!section || url.endsWith('/')) return

  const title = frontmatter.title || src.match(/^#\s+(.+)$/m)?.[1]
  const date = frontmatter.date instanceof Date
    ? frontmatter.date.toISOString().slice(0, 10)
    : frontmatter.date
  if (!title || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${url} 需要文章标题和 YYYY-MM-DD 格式的 date`)
  }

  return {
    url,
    section,
    title,
    date,
    description: frontmatter.description || '',
    ...readingStats(src)
  }
}

export default createContentLoader(['tech/**/*.md', 'essay/**/*.md'], {
  includeSrc: true,
  transform(entries) {
    return entries.map(toPost)
      .filter((post): post is Post => Boolean(post))
      .sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url))
  }
})
