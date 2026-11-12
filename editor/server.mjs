import { randomUUID } from 'node:crypto'
import { cp, glob, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublisher } from './publish.mjs'

const editorDir = fileURLToPath(new URL('./', import.meta.url))
const repo = join(editorDir, '..')
const publisher = createPublisher(repo)
const docs = join(repo, 'docs')
const drafts = join(repo, 'drafts', 'editor')
const preview = join(repo, 'drafts', '.editor-preview')
const sections = ['essay', 'tech']
const vendorPrefix = '/__editor/vendor/vditor/dist/'
const vendorDist = dirname(createRequire(import.meta.url).resolve('vditor'))
const fileTypes = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}
const staticFiles = {
  '/__editor/': ['index.html', 'text/html'],
  '/__editor/app.js': ['app.js', 'text/javascript'],
  '/__editor/figures.js': ['figures.js', 'text/javascript'],
  '/__editor/figure.css': ['../docs/.vitepress/theme/figure.css', 'text/css'],
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

function serialize(post) {
  const fields = {
    ...post.fields,
    title: post.title.trim() || '文章标题',
    date: post.date,
  }
  if (post.cover) fields.cover = post.cover
  else delete fields.cover
  const yaml = Object.entries(fields).map(([key, value]) =>
    JSON.stringify(key) + ': ' + JSON.stringify(value)).join('\n')
  return '---\n' + yaml + '\n---\n# ' + fields.title + '\n\n' + post.body + '\n'
}

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function storeAsset(id, filename, kind, bytes) {
  const extension = extname(filename).toLowerCase().replace(/[^\w.]/g, '')
  const stem = safeName(basename(filename, extname(filename))) || 'file'
  const name = randomUUID().slice(0, 8) + '-' + stem + extension
  await write(join(draftAssetFolder(id), kind + '--' + name), bytes)
  await write(join(preview, 'public', kind, name), bytes)
  return '/' + kind + '/' + name
}

async function extractEmbeddedImages(post) {
  const images = /!\[[^\]\n]*\]\(<?(data:image\/([\w.+-]+);base64,([a-z\d+/=]+))>?(?:\s+"[^"\n]*")?\)/gi
  for (const [reference, source, subtype, content] of post.body.matchAll(images)) {
    if (!post.body.includes(reference)) continue
    const extension = { jpeg: 'jpg', 'svg+xml': 'svg' }[subtype.toLowerCase()] || subtype
    const url = await storeAsset(post.id, '图片.' + extension, 'images', Buffer.from(content, 'base64'))
    post.body = post.body.replaceAll(reference, (match, offset, body) => {
      const before = body.slice(body.lastIndexOf('\n', offset - 1) + 1, offset).trim()
      const after = body.slice(offset + match.length).split('\n', 1)[0].trim()
      return (before ? '\n\n' : '') + match.replace(source, url) + (after ? '\n\n' : '')
    })
  }
  return post
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

async function removeUnusedCover(url) {
  if (!/^\/images\/[\p{L}\p{N}_-]+(?:\.[a-z0-9]+)?$/iu.test(url)) return
  for await (const file of glob('**/*.md', { cwd: docs, exclude: ['.vitepress', 'public'] })) {
    if ((await readFile(join(docs, file), 'utf8')).includes(url)) return
  }
  await rm(join(docs, 'public', url.slice(1)), { force: true })
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
  async function readPost(path) {
    const file = postPath(path)
    const env = { path: file, relativePath: path }
    getMarkdown().render(await readFile(file, 'utf8'), env)
    const { title, date, cover, ...fields } = env.frontmatter
    return {
      id: randomUUID(),
      path,
      section: path.split('/')[0],
      title: title || env.title || basename(path, '.md'),
      date: normalizeDate(date),
      cover: cover || '',
      fields,
      body: env.content.replace(/^\s*# [^\r\n]*(?:\r?\n){1,2}/, '').replace(/\r\n/g, '\n').trimEnd()
    }
  }

  return async (request, response, next) => {
    const { pathname, searchParams } = new URL(request.url, 'http://127.0.0.1')
    if (pathname === '/__editor') {
      response.writeHead(302, { Location: '/__editor/' })
      response.end()
      return
    }
    const asset = pathname.match(/^\/(images|attachments)\/([^/]+)$/)
    if (!pathname.startsWith('/__editor/') && !asset) return next()

    try {
      if (asset) {
        if (request.method !== 'GET') return next()
        const name = decodeURIComponent(asset[2])
        if (name !== basename(name) || name === '.' || name === '..') return next()
        // A newly saved asset can be requested before Vite's public-file watcher sees it.
        const content = await readFile(join(preview, 'public', asset[1], name)).catch(error => {
          if (error.code === 'ENOENT') return null
          throw error
        })
        if (!content) return next()
        if (searchParams.has('import')) {
          response.writeHead(200, { 'Content-Type': 'text/javascript' })
          response.end('export default ' + JSON.stringify(pathname))
          return
        }
        response.writeHead(200, { 'Content-Type': fileTypes[extname(name).toLowerCase()] || 'application/octet-stream' })
        response.end(content)
        return
      }
      if (pathname.startsWith(vendorPrefix) && request.method === 'GET') {
        const file = pathname.slice(vendorPrefix.length)
        const type = fileTypes[extname(file)]
        if (type && /^[\w./-]+$/.test(file)) {
          const content = await readFile(join(vendorDist, file))
          response.writeHead(200, { 'Content-Type': type })
          response.end(content)
          return
        }
      }
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
          const post = await extractEmbeddedImages(JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')))
          await restoreAssets(post, join(preview, 'public'))
          return send(response, post)
        }
        if (action === 'post') {
          const path = searchParams.get('path')
          return send(response, await extractEmbeddedImages(await readPost(path)))
        }
      }
      if (request.method === 'POST') {
        const data = await jsonBody(request)
        if (action === 'asset') {
          const kind = data.kind === 'images' ? 'images' : 'attachments'
          const url = await storeAsset(data.id, data.name, kind, Buffer.from(data.content, 'base64'))
          return send(response, { url })
        }
        if (action === 'push-review' || action === 'push-update') {
          const host = request.headers.host
          check(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) &&
            (!request.headers.origin || request.headers.origin === 'http://' + host), '请在本地编辑器操作')
          postPath(data.path)
          const result = action === 'push-review'
            ? await publisher.review(data.path)
            : await publisher.push(data.path, data.token)
          return send(response, result)
        }
        const post = await extractEmbeddedImages(data.post)
        const folder = draftFolder(post.id)
        check(sections.includes(post.section), '请选择文章栏目')
        if (action === 'preview') {
          await restoreAssets(post, join(preview, 'public'))
          const path = post.section + '/__editor-preview.md'
          await write(join(preview, path), serialize(post))
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
          const existing = post.path ? await readPost(path) : undefined
          const content = serialize(post)
          if (!existing || content !== serialize(existing)) await write(target, content)
          if (existing?.cover && existing.cover !== post.cover) await removeUnusedCover(existing.cover)
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
        markdown = md
      }
    },
    vite: {
      ...blog.vite,
      optimizeDeps: {
        ...blog.vite?.optimizeDeps,
        // The Mermaid plugin lists debug even when it is not installed.
        include: blog.vite?.optimizeDeps?.include?.filter(name => name !== 'debug')
      },
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
