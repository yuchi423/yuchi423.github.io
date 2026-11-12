import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const remoteRef = 'refs/heads/main'

export function createPublisher(repo) {
  let pushing = false

  async function git(...args) {
    const { stdout } = await exec('git', ['--literal-pathspecs', ...args], {
      cwd: repo,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024
    })
    return stdout
  }

  function assetPaths(source) {
    return [...new Set(Array.from(
      source.matchAll(/(?:^|[\s"'(<])(\/(?:images|attachments)\/[\p{L}\p{N}_-]+(?:\.[a-z0-9]+)?)/giu),
      match => 'docs/public' + match[1]
    ))]
  }

  async function tree(ref, paths) {
    const entries = await git('ls-tree', '-r', '-z', ref, '--', ...paths)
    return new Map(entries.split('\0').filter(Boolean).map(entry => {
      const tab = entry.indexOf('\t')
      return [entry.slice(tab + 1), entry.slice(0, tab).split(' ')[2]]
    }))
  }

  async function snapshot(path) {
    if ((await git('branch', '--show-current')).trim() !== 'main') {
      throw new Error('请切换到 main 分支后推送更新。')
    }
    const head = (await git('rev-parse', 'HEAD')).trim()
    const article = 'docs/' + path
    const after = await readFile(join(repo, article), 'utf8')
    const known = await tree(head, [article])
    const before = known.has(article) ? await git('show', head + ':' + article) : ''
    const currentAssets = assetPaths(after)
    const oldAssets = assetPaths(before).filter(file => !currentAssets.includes(file))
    const tracked = await tree(head, [article, ...currentAssets, ...oldAssets])
    const files = []

    async function exists(file) {
      return access(join(repo, file)).then(() => true, error => {
        if (error.code === 'ENOENT') return false
        throw error
      })
    }

    for (const file of [article, ...currentAssets]) {
      if (file !== article && !await exists(file)) continue
      const hash = (await git('hash-object', '--', file)).trim()
      if (hash !== tracked.get(file)) files.push([file, hash])
    }
    for (const file of oldAssets) {
      if (tracked.has(file) && !await exists(file)) files.push([file, null])
    }
    return { head, article, before, after, tracked, files }
  }

  function fingerprint({ head, files }) {
    return createHash('sha256').update(JSON.stringify([head, files])).digest('hex')
  }

  async function review(path) {
    const changes = await snapshot(path)
    const { head, article, before, after, tracked, files } = changes
    if (!files.length) return { files: [] }

    const diff = tracked.has(article) && before !== after
      ? await git('diff', '--no-color', '--no-ext-diff', '--no-textconv', '--text', '--unified=0', head, '--', article)
      : ''
    const hunks = Array.from(diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm), match => {
      const [, oldLine, oldCount = '1', newLine, newCount = '1'] = match
      return [Number(oldLine), Number(oldCount), Number(newLine), Number(newCount)]
    })
    return { before, after, hunks, files: files.map(([file, hash]) => hash === null ? file + '（删除）' : file), token: fingerprint(changes) }
  }

  async function remoteHead() {
    return (await git('ls-remote', '--exit-code', 'origin', remoteRef)).trim().split(/\s+/)[0]
  }

  async function push(path, token) {
    if (pushing) throw new Error('正在推送更新。')
    pushing = true
    try {
      const published = await remoteHead()
      const changes = await snapshot(path)
      const { head, files } = changes
      if (!files.length) return { updated: false }
      if (token !== fingerprint(changes)) throw new Error('保存内容已有变化，请重新打开「推送更新」查看差异。')
      if (published !== head) throw new Error('本地 main 和 GitHub main 的提交不同，请先同步分支再推送。')

      const paths = files.map(([file]) => file)
      const added = paths.filter(file => !changes.tracked.has(file))
      if (added.length) await git('add', '--intent-to-add', '--', ...added)
      await git('commit', '--only', '-m', '更新博客：' + path.split('/').at(-1).replace(/\.md$/, ''), '--', ...paths)
      const commit = (await git('rev-parse', 'HEAD')).trim()
      try {
        const committed = await tree(commit, paths)
        if (files.some(([file, hash]) => (committed.get(file) ?? null) !== hash)) {
          throw new Error('保存内容已有变化，请重新打开「推送更新」查看差异。')
        }
        await git('push', 'origin', commit + ':' + remoteRef)
      } catch (error) {
        const remote = await remoteHead().catch(() => null)
        if (remote !== commit) {
          await git('update-ref', '-m', 'Keep blog changes after failed push', 'HEAD', head, commit)
          throw error
        }
      }
      return { updated: true }
    } finally {
      pushing = false
    }
  }

  return { review, push }
}
