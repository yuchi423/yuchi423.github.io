import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const editorDir = fileURLToPath(new URL('./', import.meta.url))
const repo = join(editorDir, '..')
const docs = join(repo, 'docs')
const drafts = join(repo, 'drafts', 'editor')
const preview = join(repo, 'drafts', '.editor-preview')
const sections = ['essay', 'tech']
const staticFiles = {
  '/__editor/': ['index.html', 'text/html'],
  '/__editor/app.js': ['app.js', 'text/javascript'],
  '/__editor/style.css': ['style.css', 'text/css']
}

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function draftFolder(id) {
  check(/^[a-f\d-]{36}$/.test(id), '草稿编号无效')
  return join(drafts, id)
}

function draftAssetFolder(id) {
  return join(draftFolder(id), 'assets')
}

function dateInShanghai() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
}

function normalizeDate(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : date || dateInShanghai()
}

function safeName(name) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
}

function postPath(path) {
  check(/^(essay|tech)\/(?!index\.md$)[^/\\]+\.md$/.test(path), '请选择博客文章')
  return join(docs, path)
}

function serialize(post, revision) {
  const fields = {
    ...post.fields,
    title: post.title.trim() || '文章标题',
    date: post.date,
  }
  if (post.cover) fields.cover = post.cover
  else delete fields.cover
  if (revision !== undefined) fields.editorRevision = revision
  const yaml = Object.entries(fields).map(([key, value]) =>
    JSON.stringify(key) + ': ' + JSON.stringify(value)).join('\n')
  return '---\n' + yaml + '\n---\n# ' + fields.title + '\n\n' + post.body + '\n'
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function restoreAssets(post, destination) {
  const folder = draftAssetFolder(post.id)
  for (const file of await readdir(folder).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })) {
    const separator = file.indexOf('--')
    const kind = file.slice(0, separator)
    const name = file.slice(separator + 2)
    const url = '/' + kind + '/' + name
    if (post.cover === url || post.body.includes(url)) {
      const target = join(destination, kind, name)
      await mkdir(dirname(target), { recursive: true })
      await cp(join(folder, file), target, { force: false })
    }
  }
}

function editableBlocks(md) {
  md.core.ruler.push('editor-blocks', state => {
    if (state.env.frontmatter?.editorRevision === undefined) return
    const tokens = state.tokens
    const heading = tokens.find(token => token.type === 'heading_open' && token.tag === 'h1')
    if (!heading) return
    heading.attrSet('data-editor-revision', String(state.env.frontmatter.editorRevision))
    const bodyLine = heading.map[1] + 1
    const blocks = []
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      if (token.level !== 0 || token.nesting < 0 || !token.map || token.map[0] < bodyLine) continue
      let end = index
      if (token.nesting === 1) {
        end = tokens.findIndex((candidate, candidateIndex) =>
          candidateIndex > index && candidate.level === 0 && candidate.nesting === -1)
        if (end === -1) continue
      }
      blocks.push([index, end, token.map.map(line => line - bodyLine)])
      index = end
    }
    for (const [index, end, [from, to]] of blocks.reverse()) {
      const open = new state.Token('html_block', '', 0)
      const close = new state.Token('html_block', '', 0)
      open.content = '<div data-editor-block="' + from + ':' + to + '">\n'
      close.content = '</div>\n'
      tokens.splice(end + 1, 0, close)
      tokens.splice(index, 0, open)
    }
  })
}

async function jsonBody(request) {
  check(request.headers['content-type'] === 'application/json', '请选择编辑器操作')
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

async function listPosts() {
  const posts = []
  for (const section of sections) {
    const names = await readdir(join(docs, section))
    for (const name of names) {
      if (name.endsWith('.md') && name !== 'index.md') posts.push(section + '/' + name)
    }
  }
  await mkdir(drafts, { recursive: true })
  const entries = await readdir(drafts, { withFileTypes: true })
  const saved = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(drafts, entry.name, 'draft.json')
    try {
      const { id, title, section } = JSON.parse(await readFile(path, 'utf8'))
      saved.push({ id, title, section })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return { posts, drafts: saved }
}

function editorMiddleware(getMarkdown) {
  return async (request, response, next) => {
    const { pathname, searchParams } = new URL(request.url, 'http://127.0.0.1')
    if (pathname === '/__editor') {
      response.writeHead(302, { Location: '/__editor/' })
      response.end()
      return
    }
    if (!pathname.startsWith('/__editor/')) return next()

    try {
      if (staticFiles[pathname] && request.method === 'GET') {
        const [name, type] = staticFiles[pathname]
        const content = await readFile(join(editorDir, name))
        response.writeHead(200, { 'Content-Type': type + '; charset=utf-8' })
        response.end(content)
        return
      }
      const action = pathname.slice('/__editor/api/'.length)
      if (request.method === 'GET') {
        if (action === 'list') return send(response, await listPosts())
        if (action === 'draft') {
          const folder = draftFolder(searchParams.get('id'))
          return send(response, JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')))
        }
        if (action === 'post') {
          const path = searchParams.get('path')
          const file = postPath(path)
          const env = { path: file, relativePath: path }
          getMarkdown().render(await readFile(file, 'utf8'), env)
          const { title, date, cover, ...fields } = env.frontmatter
          return send(response, {
            id: randomUUID(),
            path,
            section: path.split('/')[0],
            title: title || env.title || basename(path, '.md'),
            date: normalizeDate(date),
            cover: cover || '',
            fields,
            body: env.content.replace(/^\s*# [^\r\n]*(?:\r?\n){1,2}/, '').replace(/\r\n/g, '\n').trimEnd()
          })
        }
      }
      if (request.method === 'POST') {
        const data = await jsonBody(request)
        if (action === 'asset') {
          const kind = data.kind === 'images' ? 'images' : 'attachments'
          const extension = extname(data.name).toLowerCase().replace(/[^\w.]/g, '')
          const stem = safeName(basename(data.name, extname(data.name))) || 'file'
          const name = randomUUID().slice(0, 8) + '-' + stem + extension
          const bytes = Buffer.from(data.content, 'base64')
          await write(join(draftAssetFolder(data.id), kind + '--' + name), bytes)
          await write(join(preview, 'public', kind, name), bytes)
          return send(response, { url: '/' + kind + '/' + name })
        }
        const post = data.post
        const folder = draftFolder(post.id)
        check(sections.includes(post.section), '请选择文章栏目')
        if (action === 'preview') {
          await restoreAssets(post, join(preview, 'public'))
          const path = post.section + '/__editor-preview.md'
          await write(join(preview, path), serialize(post, data.revision))
          return send(response, { route: '/' + path.slice(0, -3) })
        }
        if (action === 'draft') {
          await write(join(folder, 'draft.json'), JSON.stringify(post, null, 2))
          return send(response, {})
        }
        if (action === 'save') {
          check(post.title.trim(), '请先填写标题')
          const slug = safeName(post.title) || 'post-' + post.id.slice(0, 8)
          const path = post.path || post.section + '/' + slug + '.md'
          const target = postPath(path)
          if (!post.path) check(!await stat(target).catch(error => {
            if (error.code === 'ENOENT') return false
            throw error
          }), '已有同名文章，请换个标题或打开原文')
          await restoreAssets(post, join(docs, 'public'))
          await write(target, serialize(post))
          return send(response, { path })
        }
      }
      send(response, { error: '找不到这个编辑器入口' }, 404)
    } catch (error) {
      send(response, { error: error.message }, 400)
    }
  }
}

export function editorConfig(blog) {
  let markdown
  return {
    ...blog,
    markdown: {
      ...blog.markdown,
      config(md) {
        blog.markdown.config?.(md)
        editableBlocks(md)
        markdown = md
      }
    },
    vite: {
      ...blog.vite,
      plugins: [...(blog.vite?.plugins || []), {
        name: 'local-blog-editor',
        enforce: 'pre',
        transform(code, id) {
          if (id.endsWith('/vitepress-plugin-mermaid/dist/Mermaid.vue')) {
            // Hot updates can unmount the diagram before its observer is ready.
            return code.replace('mut.disconnect()', 'mut?.disconnect()')
          }
        },
        configureServer(server) {
          server.middlewares.use(editorMiddleware(() => markdown))
        }
      }]
    }
  }
}
