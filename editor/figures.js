export function setupFigures(rich, getPost, markDirty) {
  const controls = document.getElementById('figure-controls')
  const stage = controls.parentElement
  const caption = document.getElementById('figure-caption')
  const align = document.getElementById('figure-align')
  const center = document.getElementById('figure-center')
  const width = document.getElementById('figure-width')
  const handles = Array.from(controls.querySelectorAll('[data-resize]'))
  let activeFigure
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
      image.draggable = false
      paragraph.dataset.align = layout.autoCenter ? 'center' : (layout.align || 'center')
      paragraph.dataset.caption = layout.caption || '添加图片说明'
      paragraph.style.setProperty('--figure-width', layout.width ? layout.width + '%' : '')
      paragraph.style.setProperty('--figure-ratio', layout.ratio || '')
      paragraph.style.setProperty('--figure-offset', layout.offset ? layout.offset + '%' : '')
      paragraph.classList.toggle('figure-selected', source === selected)
      if (source === selected) current = { paragraph, image, layout }
    }

    activeFigure = current
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
    const fromLeft = paragraph.dataset.align === 'right'
    for (const handle of handles) {
      const x = handle.dataset.resize === 'height'
        ? bounds.left + bounds.width / 2
        : fromLeft ? bounds.left : bounds.right
      const y = handle.dataset.resize === 'width'
        ? bounds.top + bounds.height / 2
        : bounds.bottom
      handle.style.left = x - origin.left - 8 + 'px'
      handle.style.top = y - origin.top - 8 + 'px'
      handle.dataset.side = fromLeft ? 'left' : 'right'
    }
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
    activeFigure = undefined
    controls.hidden = true
    for (const paragraph of rich.querySelectorAll('.figure-selected')) {
      paragraph.classList.remove('figure-selected')
    }
  }

  function update(changes) {
    if (!selected) return
    const layouts = getPost().fields.imageLayouts ||= {}
    layouts[selected] = { ...readLayout(selected), ...changes }
    markDirty()
    sync()
  }

  function measure() {
    const { paragraph, image } = activeFigure
    const bounds = image.getBoundingClientRect()
    const line = paragraph.getBoundingClientRect()
    return {
      width: bounds.width,
      height: bounds.height,
      column: line.width,
      offset: bounds.left - line.left,
      alignment: paragraph.dataset.align
    }
  }

  function resize(start, mode, dx, dy) {
    const direction = start.alignment === 'right' ? -1 : 1
    const factor = start.alignment === 'center' ? 2 : direction
    const remaining = start.column - (start.alignment === 'free' ? start.offset : 0)
    let w = start.width
    let h = start.height

    if (mode === 'width') w += dx * factor
    if (mode === 'height') h = Math.max(12, h + dy)
    if (mode === 'both') {
      const run = start.width / Math.abs(factor)
      const rise = start.height
      const scale = 1 + (dx * direction * run + dy * rise) / (run ** 2 + rise ** 2)
      w *= scale
    }

    w = Math.max(start.column * 0.05, Math.min(remaining, w))
    if (mode === 'both') h *= w / start.width
    const percent = Math.round(w / start.column * 10000) / 100
    update({ width: percent, ratio: +(w / h).toFixed(6) })
  }

  function startDrag(event, mode) {
    event.preventDefault()
    drag = { ...measure(), mode, x: event.clientX, y: event.clientY }
    event.target.setPointerCapture(event.pointerId)
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

  caption.addEventListener('input', () => update({ caption: caption.value }))
  align.addEventListener('change', () => {
    if (align.value === 'free') {
      const { width, offset, column } = measure()
      update({
        align: 'free',
        width: Math.max(5, Math.round(width / column * 10000) / 100),
        offset: Math.max(0, Math.round(offset / column * 10000) / 100)
      })
    } else {
      update({ align: align.value })
    }
  })
  center.addEventListener('change', () => update({ autoCenter: center.checked }))
  width.addEventListener('change', () => {
    const start = measure()
    const delta = (width.valueAsNumber || 100) * start.column / 100 - start.width
    const factor = start.alignment === 'center' ? 2 : start.alignment === 'right' ? -1 : 1
    resize(start, 'width', delta / factor, 0)
  })

  for (const handle of handles) {
    handle.addEventListener('pointerdown', event => startDrag(event, handle.dataset.resize))
  }

  rich.addEventListener('pointerdown', event => {
    const image = event.target.closest('.article-figure img')
    if (!image) return
    event.preventDefault()
    const paragraph = image.closest('.article-figure')
    if (paragraph.dataset.align === 'free') {
      selected = image.getAttribute('src')
      sync()
      startDrag(event, 'move')
    }
  }, { capture: true })

  stage.addEventListener('pointermove', event => {
    if (!drag) return
    const dx = event.clientX - drag.x
    if (drag.mode === 'move') {
      const offset = Math.max(0, Math.min(drag.column - drag.width, drag.offset + dx))
      update({ offset: Math.round(offset / drag.column * 10000) / 100 })
    } else {
      resize(drag, drag.mode, dx, event.clientY - drag.y)
    }
  })
  stage.addEventListener('lostpointercapture', () => { drag = undefined })

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
