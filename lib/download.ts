import { t } from '@/lib/i18n/zh'

/** 文件名非法字符与 Windows 控制字符。 */
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g
const EDGE_CHARS = /^[\s.-]+|[\s.-]+$/g
const MAX_FILENAME_LENGTH = 80

/**
 * 由记录标题生成 .md 文件名（FR-10.2）。
 *
 * 非法字符替换为短横线，折叠连续短横线并去掉两侧的短横线、点与空格；
 * 截断到 80 字符；标题为空时回落到「提示词」。
 */
export function safeMarkdownFilename(title: string): string {
  const cleaned = title
    .replace(INVALID_FILENAME_CHARS, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(EDGE_CHARS, '')
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(EDGE_CHARS, '')
  const base = cleaned.length > 0 ? cleaned : t('download.defaultTitle')
  return `${base}.md`
}

/** 下载 Markdown 文件；无 DOM 环境返回 false。 */
export function downloadMarkdown(source: string, title: string): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  const doc = document
  if (!doc.body || typeof URL.createObjectURL !== 'function') {
    return false
  }

  const filename = safeMarkdownFilename(title)
  let url: string
  try {
    url = URL.createObjectURL(
      new Blob([source], { type: 'text/markdown;charset=utf-8' }),
    )
  } catch {
    return false
  }

  const anchor = doc.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  try {
    doc.body.appendChild(anchor)
    anchor.click()
    return true
  } catch {
    return false
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
