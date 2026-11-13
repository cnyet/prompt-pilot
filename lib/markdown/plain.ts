/**
 * Markdown 转纯文本（FR-10.3）。
 *
 * 只做确定性字符串处理：去标题井号、强调标记、反引号、链接语法、图片语法、
 * 引用与列表标记、表格分隔行，保留可读文字，压缩多余空行。不解析原始 HTML，
 * 标签直接移除；`<br>` 视为换行。
 */
export function markdownToPlainText(source: string): string {
  if (source === '') return ''

  let text = source.replace(/\r\n?/g, '\n')

  // 围栏代码块只去围栏行，保留代码内容
  text = text.replace(/^[ \t]{0,3}(?:```+|~~~+)[^\n]*$/gm, '')

  // 图片先于链接处理，保留 alt 文字
  text = text.replace(/!\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
  text = text.replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1')

  // 链接保留文字，丢弃地址
  text = text.replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')

  // 自动链接与原始 HTML
  text = text.replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '')

  const lines = text.split('\n')
  const output: string[] = []

  for (const rawLine of lines) {
    // 表格分隔行：只含 | : - 与空白，且至少含一个 - 与一个 |
    if (
      rawLine.includes('|') &&
      rawLine.includes('-') &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(rawLine)
    ) {
      continue
    }

    // 水平分隔线
    if (/^\s*(?:[-*_]\s*){3,}$/.test(rawLine)) {
      continue
    }

    let line = rawLine
    line = line.replace(/^\s{0,3}#{1,6}\s+/, '')
    line = line.replace(/^\s*(?:>\s?)+/, '')
    line = line.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '')
    line = line.replace(/^\[[ xX]\]\s+/, '')

    // GFM 表格行：去掉首尾竖线，单元格之间用空格连接
    const trimmed = line.trim()
    if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.includes(' | '))) {
      line = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
        .join(' ')
    }

    output.push(stripInlineMarkers(line).trimEnd())
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripInlineMarkers(input: string): string {
  let text = input

  // 转义字符先占位，避免被强调规则改写
  const escaped: string[] = []
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, (_match, char: string) => {
    escaped.push(char)
    return `\u0000${escaped.length - 1}\u0000`
  })

  // 行内代码内容先占位，代码里的星号与下划线不是 Markdown 标记
  const codes: string[] = []
  text = text.replace(/`+([^`]*)`+/g, (_match, code: string) => {
    codes.push(code)
    return `\u0001${codes.length - 1}\u0001`
  })

  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/\*([^*\n]+)\*/g, '$1')
  text = text.replace(
    /(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g,
    '$1',
  )
  text = text.replace(/~~([^~\n]+)~~/g, '$1')
  // 未闭合的反引号同样去掉
  text = text.replace(/`/g, '')

  text = text.replace(/\u0001(\d+)\u0001/g, (_match, index: string) => {
    return codes[Number(index)] ?? ''
  })
  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => {
    return escaped[Number(index)] ?? ''
  })
}
