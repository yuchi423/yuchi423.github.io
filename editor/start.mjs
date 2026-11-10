import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createServer } from 'vitepress'

const repo = fileURLToPath(new URL('../', import.meta.url))
const root = join(repo, 'drafts', '.editor-preview')

await rm(root, { recursive: true, force: true })
await cp(join(repo, 'docs'), root, {
  recursive: true,
  filter: source => !/[\\/]\.vitepress[\\/](dist|cache)([\\/]|$)/.test(source)
})
await cp(join(root, '.vitepress', 'config.mts'), join(root, '.vitepress', 'blog-config.mts'))
await writeFile(join(root, '.vitepress', 'config.mts'), [
  "import blog from './blog-config.mts'",
  "import { editorConfig } from '../../../editor/server.mjs'",
  'export default editorConfig(blog)',
  ''
].join('\n'))

for (const section of ['tech', 'essay']) {
  await mkdir(join(root, section), { recursive: true })
  await writeFile(join(root, section, '__editor-preview.md'), '---\ndate: "2000-01-01"\n---\n# 文章标题\n')
}

const server = await createServer(root, { host: '127.0.0.1', port: 5174, strictPort: true })
await server.listen()
console.log('编辑器已启动，请在浏览器打开 http://127.0.0.1:5174/__editor/')
console.log('保持此终端运行，按 Ctrl+C 停止。')
