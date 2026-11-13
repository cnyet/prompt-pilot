/**
 * 复制 Markdown 源码（FR-10.1）。
 *
 * 优先 `navigator.clipboard.writeText`；不可用或被拒绝时退到临时 textarea
 * 加 `document.execCommand('copy')`。纯 node 环境没有 DOM，返回 false，
 * 调用方据此显示失败反馈而不是假装成功。
 */

function copyViaDom(text: string): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  const doc = document
  if (!doc.body || typeof doc.execCommand !== 'function') {
    return false
  }

  const area = doc.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.position = 'fixed'
  area.style.top = '0'
  area.style.left = '-9999px'
  area.style.opacity = '0'
  doc.body.appendChild(area)

  const previous = doc.activeElement
  let copied = false
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, area.value.length)
    copied = doc.execCommand('copy')
  } catch {
    copied = false
  } finally {
    area.remove()
    if (previous instanceof HTMLElement) {
      previous.focus()
    }
  }
  return copied
}

function defaultWriter(): ((value: string) => Promise<void>) | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }
  const clipboard = navigator.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    return undefined
  }
  return (value) => clipboard.writeText(value)
}

export async function copyText(
  text: string,
  writer?: (value: string) => Promise<void>,
): Promise<boolean> {
  const write = writer ?? defaultWriter()
  if (write) {
    try {
      await write(text)
      return true
    } catch {
      // 权限被拒或接口异常时继续走 DOM 兜底。
    }
  }
  return copyViaDom(text)
}
