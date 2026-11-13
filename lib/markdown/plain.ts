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

  // 围栏代码块先整体占位：只去围栏行，代码内容按字面保留，
  // 不参与后续链接、图片与强调标记替换。
  const fenced = extractFencedBlocks(text)
  text = fenced.text

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

  const plain = output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return restoreFencedBlocks(plain, fenced.blocks)
}

interface ExtractedFences {
  text: string
  blocks: string[]
}

/**
 * 把围栏代码块（``` / ~~~，含未闭合围栏）替换为占位符，围栏行丢弃，
 * 内容原样留待最后恢复。
 */
function extractFencedBlocks(source: string): ExtractedFences {
  const lines = source.split('\n')
  const output: string[] = []
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] as string
    const opening = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (opening === null) {
      output.push(line)
      index += 1
      continue
    }

    const fence = opening[1] as string
    const marker = fence[0] as string
    const closingPattern = new RegExp(
      `^[ \\t]{0,3}${marker}{${fence.length},}[ \\t]*$`,
    )

    const contentLines: string[] = []
    let cursor = index + 1
    let closed = false
    while (cursor < lines.length) {
      const candidate = lines[cursor] as string
      if (closingPattern.test(candidate)) {
        closed = true
        break
      }
      contentLines.push(candidate)
      cursor += 1
    }

    const content = contentLines.join('\n')
    if (content !== '') {
      output.push(`\u0002${blocks.length}\u0002`)
      blocks.push(content)
    }
    index = closed ? cursor + 1 : cursor
  }

  return { text: output.join('\n'), blocks }
}

function restoreFencedBlocks(text: string, blocks: string[]): string {
  if (blocks.length === 0) return text
  return text.replace(/\u0002(\d+)\u0002/g, (_match, index: string) => {
    return blocks[Number(index)] ?? ''
  })
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
