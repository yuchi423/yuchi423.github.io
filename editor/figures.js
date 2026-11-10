export function setupFigures(rich, getPost, markDirty) {
  const controls = document.getElementById('figure-controls')
  const stage = controls.parentElement
  const caption = document.getElementById('figure-caption')
  const align = document.getElementById('figure-align')
  const center = document.getElementById('figure-center')
  const width = document.getElementById('figure-width')
  const handle = document.getElementById('figure-resize')
  let selected
  let drag
  let animationFrame

  function readLayout(source) {
    return getPost()?.fields?.imageLayouts?.[source] || {}
  }

  function imageOf(paragraph) {
    const nodes = Array.from(paragraph.childNodes).filter(node =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent.replace(/\u200b/g, '').trim()
        : node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'WBR')
    if (nodes.length !== 1 || nodes[0].dataset?.type !== 'img') return
    return nodes[0].querySelector(':scope > img')
  }

  function sync() {
    let current
    for (const paragraph of rich.querySelectorAll('.vditor-ir p:has([data-type="img"] > img), .vditor-ir p.article-figure')) {
      const image = imageOf(paragraph)
      if (!image) {
        paragraph.classList.remove('article-figure', 'figure-selected')
        continue
      }
      const source = image.getAttribute('src')
      const layout = readLayout(source)
      paragraph.classList.add('article-figure')
      image.parentElement.classList.add('figure-image')
      paragraph.dataset.align = layout.autoCenter ? 'center' : (layout.align || 'center')
      paragraph.dataset.caption = layout.caption || '添加图片说明'
      paragraph.style.setProperty('--figure-width', layout.width ? layout.width + '%' : 'auto')
      paragraph.classList.toggle('figure-selected', source === selected)
      if (source === selected) current = { paragraph, image, layout }
    }

    controls.hidden = !current
    if (!current) return
    const { paragraph, image, layout } = current
    const origin = stage.getBoundingClientRect()
    const bounds = image.getBoundingClientRect()
    const line = paragraph.getBoundingClientRect()
    const inputWidth = Math.min(line.width, Math.max(156, bounds.width))
    const inputLeft = Math.max(line.left, Math.min(bounds.left + (bounds.width - inputWidth) / 2, line.right - inputWidth))

    caption.style.left = inputLeft - origin.left + 'px'
    caption.style.top = bounds.bottom - origin.top + 6 + 'px'
    caption.style.width = inputWidth + 'px'
    handle.style.left = bounds.right - origin.left - 8 + 'px'
    handle.style.top = bounds.bottom - origin.top - 8 + 'px'
    controls.style.setProperty('--figure-toolbar-top', bounds.top - origin.top + 8 + 'px')

    if (document.activeElement !== caption) caption.value = layout.caption || ''
    align.value = layout.align || 'center'
    center.checked = Boolean(layout.autoCenter)
    align.disabled = center.checked
    if (document.activeElement !== width) {
      width.value = layout.width || Math.round(bounds.width / line.width * 100)
    }
  }

  function clear() {
    selected = undefined
    controls.hidden = true
    for (const paragraph of rich.querySelectorAll('.figure-selected')) {
      paragraph.classList.remove('figure-selected')
    }
  }

  function update(field, value) {
    if (!selected) return
    const layouts = getPost().fields.imageLayouts ||= {}
    layouts[selected] = { ...readLayout(selected), [field]: value }
    markDirty()
    sync()
  }

  function setWidth(value) {
    update('width', Math.max(5, Math.min(100, Math.round(value))))
  }

  rich.addEventListener('click', event => {
    const paragraph = event.target.closest('.article-figure')
    const image = paragraph && imageOf(paragraph)
    if (!image) return
    event.preventDefault()
    event.stopPropagation()
    clear()
    selected = image.getAttribute('src')
    sync()
    if (event.target === paragraph) caption.focus()
  }, { capture: true })

  document.addEventListener('pointerdown', event => {
    if (!controls.contains(event.target) && !event.target.closest('.article-figure')) clear()
  })

  caption.addEventListener('input', () => update('caption', caption.value))
  align.addEventListener('change', () => update('align', align.value))
  center.addEventListener('change', () => update('autoCenter', center.checked))
  width.addEventListener('change', () => setWidth(width.valueAsNumber || 100))

  handle.addEventListener('pointerdown', event => {
    const paragraph = rich.querySelector('.figure-selected')
    if (!paragraph) return
    event.preventDefault()
    const image = imageOf(paragraph)
    const alignment = paragraph.dataset.align
    drag = {
      x: event.clientX,
      width: image.getBoundingClientRect().width,
      available: paragraph.getBoundingClientRect().width,
      factor: alignment === 'center' ? 2 : alignment === 'right' ? -1 : 1
    }
    handle.setPointerCapture(event.pointerId)
  })
  handle.addEventListener('pointermove', event => {
    if (!drag) return
    setWidth((drag.width + (event.clientX - drag.x) * drag.factor) / drag.available * 100)
  })
  handle.addEventListener('lostpointercapture', () => { drag = undefined })

  function scheduleSync() {
    if (animationFrame) return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined
      sync()
    })
  }

  new MutationObserver(scheduleSync).observe(rich, { childList: true, subtree: true })
  new ResizeObserver(scheduleSync).observe(rich)
  rich.addEventListener('load', scheduleSync, { capture: true })
  return { clear }
}
