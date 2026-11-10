import { setupFigures } from './figures.js'

const element = id => document.getElementById(id)
const frame = element('preview')
const compose = element('compose')
const title = element('title')
const section = element('section')
const date = element('date')
const rich = element('rich-editor')
const markdown = element('markdown')
const file = element('file')
const status = element('status')
const previewButton = element('toggle-preview')
const sourceButton = element('source')

let post
let dirty = false
let richChanged = false
let sourceMode = false
let previewMode = false
let assetAction
let linkRange
let richRange
let frameObserver
let resizeObserver
const dark = matchMedia('(prefers-color-scheme: dark)').matches
const vendor = '/__editor/vendor/vditor'

const editor = new window.Vditor(rich, {
  cdn: vendor,
  mode: 'ir',
  toolbar: [],
  toolbarConfig: { hide: true },
  cache: { enable: false },
  counter: { enable: false },
  theme: dark ? 'dark' : 'classic',
  preview: { theme: { current: dark ? 'dark' : 'light', path: vendor + '/dist/css/content-theme' } },
  minHeight: 450,
  placeholder: '请输入正文',
  input: markRichChanged,
  after: newPost
})

const figures = setupFigures(rich, () => post, () => { dirty = true })

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
    if (!post) return
    try {
      await callback()
    } catch (error) {
      showStatus(error.message, true)
    }
  })
}

function readBody() {
  if (sourceMode) return markdown.value
  return richChanged ? editor.getValue() : post.body
}

function readForm() {
  return { ...post, title: title.value, section: section.value, date: date.value, body: readBody() }
}

function showComposer() {
  previewMode = false
  frame.hidden = true
  compose.hidden = false
  previewButton.textContent = '博客预览'
  sourceButton.disabled = false
}

async function showPreview() {
  const current = post
  previewButton.disabled = true
  try {
    const { route } = await api('preview', { post: readForm() })
    if (post !== current) return
    previewMode = true
    compose.hidden = true
    frame.hidden = false
    frame.src = route
    previewButton.textContent = '返回写作'
    sourceButton.disabled = true
  } finally {
    previewButton.disabled = false
  }
}

function showCover() {
  const image = element('cover-preview')
  element('cover-block').hidden = !post.cover
  if (post.cover) image.src = post.cover
  else image.removeAttribute('src')
  element('remove-cover').hidden = !post.cover
}

function loadPost(next) {
  figures.clear()
  post = next
  title.value = next.title
  section.value = next.section
  section.disabled = Boolean(next.path)
  date.value = next.date
  markdown.value = next.body
  editor.setValue(next.body, true)
  richChanged = false
  richRange = undefined
  dirty = false
  showCover()
  showComposer()
  showStatus(next.path || '在正文里直接输入，回车即可换行。')
}

function newPost() {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
  loadPost({ id: crypto.randomUUID(), title: '', section: 'essay', date: today, body: '', cover: '', fields: {} })
}

function canLeave() {
  return !dirty || window.confirm('当前文章还有改动。切换文章？')
}

frame.addEventListener('load', () => {
  frameObserver?.disconnect()
  resizeObserver?.disconnect()
  const doc = frame.contentDocument
  function syncPreview() {
    const layout = doc.querySelector('.Layout')
    if (!layout) return
    layout.style.minHeight = '0'
    frame.style.height = Math.max(380, Math.ceil(layout.getBoundingClientRect().height)) + 'px'
    for (const link of doc.querySelectorAll('.post-pager a, .post-sidebar a')) {
      link.target = '_self'
    }
  }
  frameObserver = new MutationObserver(syncPreview)
  frameObserver.observe(doc.body, { childList: true, subtree: true })
  resizeObserver = new ResizeObserver(syncPreview)
  resizeObserver.observe(doc.body)
  syncPreview()
  doc.addEventListener('click', async event => {
    const link = event.target.closest('.post-pager a, .post-sidebar a')
    if (!link) return
    event.preventDefault()
    const path = decodeURIComponent(link.pathname.slice(1)) + '.md'
    if (link.getAttribute('aria-current') === 'page' || path === post.path || !canLeave()) return
    try {
      loadPost(await api('post?path=' + encodeURIComponent(path)))
    } catch (error) {
      showStatus(error.message, true)
    }
  })
})

action('toggle-preview', () => {
  if (previewMode) showComposer()
  else return showPreview()
})

for (const input of [title, section, date, markdown]) {
  input.addEventListener('input', () => { dirty = true })
}
function markRichChanged() {
  richChanged = true
  dirty = true
}

rich.addEventListener('input', markRichChanged)
rich.addEventListener('keydown', event => {
  if (event.key === 'Enter') markRichChanged()
})

function rememberRichRange() {
  const selection = window.getSelection()
  if (selection.rangeCount && rich.contains(selection.anchorNode) && rich.contains(selection.focusNode)) {
    richRange = selection.getRangeAt(0).cloneRange()
  }
  return richRange
}

document.addEventListener('selectionchange', rememberRichRange)
rich.addEventListener('focusout', rememberRichRange)

action('source', () => {
  post.body = readBody()
  figures.clear()
  sourceMode = !sourceMode
  markdown.hidden = !sourceMode
  rich.hidden = sourceMode
  sourceButton.textContent = sourceMode ? '返回正文' : 'Markdown 源码'
  if (sourceMode) {
    markdown.value = post.body
    markdown.focus()
  } else {
    editor.setValue(post.body, true)
    richChanged = false
    richRange = undefined
    editor.focus()
  }
})

function selectedRange() {
  return sourceMode ? [markdown.selectionStart, markdown.selectionEnd] : rememberRichRange()
}

function insert(text, range, imageBlock = false) {
  if (previewMode) showComposer()
  if (sourceMode) {
    markdown.focus()
    const value = imageBlock ? '\n\n' + text + '\n\n' : text
    markdown.setRangeText(value, ...(range || [markdown.selectionStart, markdown.selectionEnd]), 'end')
  } else {
    const surface = rich.querySelector('.vditor-ir [contenteditable="true"]')
    const cursor = range?.cloneRange() || document.createRange()
    surface.focus()
    if (!range) {
      cursor.selectNodeContents(surface)
      cursor.collapse(false)
    }
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(cursor)
    if (imageBlock) {
      const block = cursor.startContainer.parentElement?.closest('p')
      if (block?.textContent.replace(/\u200b/g, '').trim()) {
        document.execCommand('insertParagraph')
      }
      editor.insertMD(text)
      document.execCommand('insertParagraph')
    } else {
      editor.insertMD(text)
    }
    richChanged = true
  }
  dirty = true
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

async function insertAsset(picked, kind, range) {
  const current = post
  try {
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(picked)
    })
    const extension = picked.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg')
    const name = picked.name || '图片.' + (extension || 'png')
    const { url } = await api('asset', {
      id: current.id,
      name,
      kind: kind === 'attachment' ? 'attachments' : 'images',
      content
    })
    if (post !== current) return
    if (kind === 'cover') {
      post.cover = url
      showCover()
      dirty = true
      if (previewMode) await showPreview()
    } else {
      const image = kind === 'image'
      insert((image ? '!' : '') + '[' + markdownLabel(name) + '](' + url + ')', range, image)
    }
  } catch (error) {
    showStatus(error.message, true)
  }
}

file.addEventListener('change', () => {
  const picked = file.files[0]
  if (picked) insertAsset(picked, assetAction.kind, assetAction.range)
})

async function pasteImage(event) {
  const clipboard = event.clipboardData
  const file = Array.from(clipboard.files).find(item => item.type.startsWith('image/'))
  const text = clipboard.getData('text/plain').trim()
  const embedded = text.match(/^(?:!\[[^\]\n]*\]\(<?)?(data:image\/[\w.+-]+;base64,[a-z\d+/=]+)(?:>?\))?$/i)
  if (!file && !embedded) return

  event.preventDefault()
  event.stopPropagation()
  const range = selectedRange()
  try {
    const image = file || await (await fetch(embedded[1])).blob()
    await insertAsset(image, 'image', range)
  } catch (error) {
    showStatus(error.message, true)
  }
}

rich.addEventListener('paste', pasteImage, { capture: true })
markdown.addEventListener('paste', pasteImage, { capture: true })

action('remove-cover', async () => {
  post.cover = ''
  showCover()
  dirty = true
  if (previewMode) await showPreview()
})

const linkDialog = element('link-dialog')
action('link', () => {
  linkRange = selectedRange()
  element('link-text').value = sourceMode && linkRange
    ? markdown.value.slice(...linkRange)
    : linkRange?.toString() || ''
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
  } catch (error) {
    showStatus(error.message, true)
  }
  openDialog.close()
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
    showComposer()
    title.focus()
    throw new Error('请先填写标题')
  }
  if (!date.value) {
    date.focus()
    throw new Error('请填写发布日期')
  }
  const { path } = await api('save', { post: readForm() })
  post.path = path
  section.disabled = true
  dirty = false
  showStatus('已保存到 docs/' + path + '。提交并推送到 main 后发布。')
})
