const element = id => document.getElementById(id)
const frame = element('preview')
const canvas = element('canvas')
const title = element('title')
const section = element('section')
const date = element('date')
const block = element('block')
const markdown = element('markdown')
const file = element('file')
const status = element('status')

let post
let active
let dirty = false
let assetAction
let linkRange
let frameRoute
let observer
let resizeObserver
let revision = 0
let previewTimer
let sending = false
let pending = false
const snapshots = new Map()

function showStatus(message, error = false) {
  status.textContent = message
  status.classList.toggle('error', error)
}

async function api(action, data) {
  const response = await fetch('/__editor/api/' + action, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

function action(id, callback) {
  element(id).addEventListener('click', async () => {
    try {
      await callback()
    } catch (error) {
      showStatus(error.message, true)
    }
  })
}

function readForm() {
  return { ...post, title: title.value, section: section.value, date: date.value }
}

function queuePreview() {
  dirty = true
  clearTimeout(previewTimer)
  previewTimer = setTimeout(updatePreview, 400)
}

async function updatePreview() {
  clearTimeout(previewTimer)
  if (sending) {
    pending = true
    return
  }
  sending = true
  const snapshot = readForm()
  const nextRevision = ++revision
  snapshots.set(nextRevision, snapshot.body)
  if (snapshots.size > 30) snapshots.delete(snapshots.keys().next().value)
  try {
    const { route } = await api('preview', { post: snapshot, revision: nextRevision })
    if (snapshot.id !== post.id) return
    if (frameRoute !== route) {
      frameRoute = route
      frame.src = route
    }
  } catch (error) {
    showStatus(error.message, true)
  } finally {
    sending = false
    if (pending) {
      pending = false
      updatePreview()
    }
  }
}

function loadPost(next) {
  clearTimeout(previewTimer)
  active = undefined
  block.hidden = true
  post = next
  title.value = next.title
  section.value = next.section
  section.disabled = Boolean(next.path)
  date.value = next.date
  element('remove-cover').hidden = !next.cover
  dirty = false
  showStatus(next.path || '点击正文编辑，或添加段落开始写作。')
  updatePreview()
}

function newPost() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
  loadPost({ id: crypto.randomUUID(), title: '', section: 'essay', date: today, body: '', cover: '', fields: {} })
}

function canLeave() {
  return !dirty || window.confirm('当前文章还有改动。切换文章？')
}

function position(element, rect, y) {
  const origin = canvas.getBoundingClientRect()
  const page = frame.getBoundingClientRect()
  element.style.left = page.left - origin.left + rect.left + 'px'
  element.style.width = rect.width + 'px'
  element.style.top = page.top - origin.top + y + 'px'
}

function syncFrame() {
  const doc = frame.contentDocument
  const heading = doc?.querySelector('h1[data-editor-revision]')
  if (!heading) return
  const layout = doc.querySelector('.Layout')
  frame.style.height = Math.max(380, Math.ceil(layout.getBoundingClientRect().height)) + 'px'
  const rect = heading.getBoundingClientRect()
  const content = heading.parentElement.getBoundingClientRect()
  title.style.height = rect.height + 'px'
  const style = frame.contentWindow.getComputedStyle(heading)
  title.style.font = style.font
  position(title, content, rect.top)
  title.hidden = false
  const page = frame.getBoundingClientRect()
  const append = element('append')
  append.style.marginLeft = Math.max(12, page.left + content.left - canvas.getBoundingClientRect().left) + 'px'
}

function offset(body, line) {
  const lines = body.split('\n')
  if (line >= lines.length) return body.length
  return lines.slice(0, line).reduce((length, value) => length + value.length + 1, 0)
}

function selectBlock(target, doc) {
  const heading = doc.querySelector('h1[data-editor-revision]')
  const rendered = snapshots.get(Number(heading?.dataset.editorRevision))
  if (rendered === undefined) return
  const [startLine, endLine] = target.dataset.editorBlock.split(':').map(Number)
  const start = offset(rendered, startLine)
  let end = offset(rendered, endLine)
  if (rendered[end - 1] === '\n') end--
  const fragment = rendered.slice(start, end)
  const before = rendered.slice(0, start)
  const after = rendered.slice(end)
  let current = start
  if (!post.body.startsWith(before + fragment)) {
    if (!post.body.endsWith(fragment + after)) {
      showStatus('预览正在更新，稍后点选段落。')
      return
    }
    current = post.body.length - after.length - fragment.length
  }
  finishBlock()
  const rect = (target.lastElementChild || target).getBoundingClientRect()
  const content = heading.parentElement.getBoundingClientRect()
  openBlock(current, current + fragment.length, content, rect.bottom + 6)
}

frame.addEventListener('load', () => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  const doc = frame.contentDocument
  const styles = doc.createElement('style')
  styles.textContent = '.Layout { min-height: 0 !important; } h1[data-editor-revision] { visibility: hidden; } [data-editor-block] { display: contents; } [data-editor-block] > :first-child:hover { outline: 1px solid var(--vp-c-divider); outline-offset: 3px; }'
  doc.head.append(styles)
  doc.addEventListener('click', event => {
    const target = event.target.closest('[data-editor-block]')
    if (target) {
      event.preventDefault()
      selectBlock(target, doc)
    } else {
      if (event.target.closest('a')) event.preventDefault()
      finishBlock()
    }
  })
  observer = new MutationObserver(syncFrame)
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true })
  resizeObserver = new ResizeObserver(syncFrame)
  resizeObserver.observe(doc.body)
  syncFrame()
})

window.addEventListener('resize', syncFrame)

function editorSize() {
  markdown.style.height = 'auto'
  markdown.style.height = Math.min(300, markdown.scrollHeight + 2) + 'px'
}

function openBlock(start, end, rect, top, label = '编辑段落') {
  active = { before: post.body.slice(0, start), after: post.body.slice(end) }
  markdown.value = post.body.slice(start, end)
  element('block-label').textContent = label
  block.hidden = false
  position(block, rect, top)
  editorSize()
  markdown.focus({ preventScroll: true })
  markdown.setSelectionRange(markdown.value.length, markdown.value.length)
  const blockRect = block.getBoundingClientRect()
  if (blockRect.bottom > innerHeight) block.scrollIntoView({ block: 'nearest' })
}

function openAtEnd() {
  finishBlock()
  const heading = frame.contentDocument.querySelector('h1[data-editor-revision]')
  const rect = heading?.parentElement.getBoundingClientRect() || { left: 20, width: frame.clientWidth - 40 }
  const end = post.body.length
  openBlock(end, end, rect, frame.clientHeight + 46, '新段落')
  if (post.body) active.before += post.body.endsWith('\n') ? '\n' : '\n\n'
}

function finishBlock() {
  if (!active) return
  active = undefined
  block.hidden = true
  updatePreview()
}

markdown.addEventListener('input', () => {
  if (!active) return
  post.body = active.before + markdown.value + active.after
  editorSize()
  queuePreview()
})

markdown.addEventListener('keydown', event => {
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
    event.preventDefault()
    finishBlock()
  }
})

for (const input of [title, section, date]) input.addEventListener('input', queuePreview)
action('append', openAtEnd)
action('done', finishBlock)

action('source', () => {
  finishBlock()
  const heading = frame.contentDocument.querySelector('h1[data-editor-revision]')
  const rect = heading?.parentElement.getBoundingClientRect() || { left: 20, width: frame.clientWidth - 40 }
  openBlock(0, post.body.length, rect, (heading?.getBoundingClientRect().bottom || 70) + 32, '正文 Markdown')
})

function selectedRange() {
  return active ? [markdown.selectionStart, markdown.selectionEnd] : undefined
}

function insert(text, range) {
  if (!active) openAtEnd()
  markdown.focus({ preventScroll: true })
  const [start, end] = range || [markdown.selectionStart, markdown.selectionEnd]
  markdown.setRangeText(text, start, end, 'end')
  markdown.dispatchEvent(new Event('input'))
}

function markdownLabel(text) {
  return text.replace(/[\\[\]]/g, '\\$&')
}

for (const kind of ['cover', 'image', 'attachment']) {
  action(kind, () => {
    assetAction = { kind, range: selectedRange() }
    file.accept = kind === 'attachment' ? '' : 'image/*'
    file.value = ''
    file.click()
  })
}

file.addEventListener('change', async () => {
  const picked = file.files[0]
  if (!picked) return
  const { kind, range } = assetAction
  try {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(picked)
    })
    const { url } = await api('asset', {
      id: post.id,
      name: picked.name,
      kind: kind === 'attachment' ? 'attachments' : 'images',
      content
    })
    if (kind === 'cover') {
      post.cover = url
      element('remove-cover').hidden = false
      dirty = true
      updatePreview()
    } else {
      insert((kind === 'image' ? '!' : '') + '[' + markdownLabel(picked.name) + '](' + url + ')', range)
    }
  } catch (error) {
    showStatus(error.message, true)
  }
})

action('remove-cover', () => {
  post.cover = ''
  element('remove-cover').hidden = true
  dirty = true
  updatePreview()
})

const linkDialog = element('link-dialog')
action('link', () => {
  linkRange = selectedRange()
  element('link-text').value = linkRange ? markdown.value.slice(...linkRange) : ''
  element('link-url').value = ''
  linkDialog.showModal()
})
element('link-form').addEventListener('submit', event => {
  event.preventDefault()
  const url = element('link-url').value.trim()
  const label = element('link-text').value.trim() || url
  linkDialog.close()
  insert('[' + markdownLabel(label) + '](<' + url + '>)', linkRange)
})

action('new', () => {
  if (canLeave()) newPost()
})

const openDialog = element('open-dialog')
action('open', async () => {
  if (!canLeave()) return
  const { drafts, posts } = await api('list')
  const choice = element('open-choice')
  choice.replaceChildren()
  for (const [label, entries] of [
    ['草稿', drafts.map(draft => [draft.title || '未命名草稿', 'draft?id=' + draft.id])],
    ['博客文章', posts.map(path => [path, 'post?path=' + encodeURIComponent(path)])]
  ]) {
    const group = document.createElement('optgroup')
    group.label = label
    for (const [text, value] of entries) group.append(new Option(text, value))
    if (entries.length) choice.append(group)
  }
  if (choice.options.length) openDialog.showModal()
  else showStatus('保存草稿或文章后，可以在这里打开。')
})

element('open-form').addEventListener('submit', async event => {
  event.preventDefault()
  try {
    loadPost(await api(element('open-choice').value))
    openDialog.close()
  } catch (error) {
    showStatus(error.message, true)
    openDialog.close()
  }
})

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close())
}

action('save-draft', async () => {
  await api('draft', { post: readForm() })
  dirty = false
  showStatus('草稿已保存，可从「打开」继续编辑。')
})

action('save', async () => {
  if (!title.value.trim()) {
    title.focus()
    throw new Error('请先填写标题')
  }
  if (!date.value) {
    date.focus()
    throw new Error('请填写发布日期')
  }
  const snapshot = readForm()
  const { path } = await api('save', { post: snapshot })
  post.path = path
  section.disabled = true
  dirty = false
  showStatus('已保存到 docs/' + path + '。提交并推送到 main 后发布。')
})

newPost()
