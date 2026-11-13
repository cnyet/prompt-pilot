/**
 * v3 元数据协议（ARCHITECTURE §五）。
 *
 * 模型先输出完整 Markdown 正文，正文结束后另起一行输出
 * `<<<PROMPTPILOT_META>>>`，再输出 {"title":"...","notes":[...]}。
 * 服务端边流边切分：分隔符前实时下发 delta，分隔符后缓冲，
 * 结束时解析并发一条 meta 事件。分隔符与 JSON 绝不进入正文。
 *
 * 解析失败（缺分隔符 / 坏 JSON / 分隔符提前出现）一律降级：
 * title 为 null（调用方取输入前 24 字兜底），notes 为空数组，正文不受影响。
 */

export const META_SEPARATOR = '<<<PROMPTPILOT_META>>>'

export interface MetaResult {
  /** null 表示解析失败或未提供，调用方用输入前 24 字兜底（NFR-11） */
  title: string | null
  /** 最多 3 条改动说明；生成类通常为空数组 */
  notes: string[]
}

const MAX_NOTES = 3

/** 分隔符可能被 chunk 劈开；持有尾部不足一个完整分隔符长度的字符不放行。 */
const HOLD_BACK = META_SEPARATOR.length - 1

interface RawMeta {
  title: unknown
  notes: unknown
}

function parseMetaJson(raw: string): RawMeta | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) {
      return null
    }
    const record = value as Record<string, unknown>
    return { title: record.title, notes: record.notes }
  } catch {
    return null
  }
}

function sanitizeNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) {
    return []
  }
  return notes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export class MetaSplitter {
  private pending = ''
  private tail = ''
  private separatorSeen = false
  private metaRaw: string | null = null
  private bodyEmitted = 0

  /** 返回本次可以立即下发到 delta 的正文片段；元数据段永不返回。 */
  push(chunk: string): string {
    this.pending += chunk
    if (!this.separatorSeen) {
      return this.drainBeforeSeparator()
    }
    // 分隔符已出现：全部缓冲为元数据
    this.metaRaw = (this.metaRaw ?? '') + this.pending
    this.pending = ''
    return ''
  }

  finish(): MetaResult {
    if (!this.separatorSeen) {
      // 缺分隔符：降级，正文已由 push + flushTail 完整放行
      return { title: null, notes: [] }
    }
    if (this.bodyEmitted === 0) {
      // 分隔符提前出现（正文为空）：元数据不可信，整体降级
      return { title: null, notes: [] }
    }
    const parsed = parseMetaJson(this.metaRaw ?? '')
    if (!parsed) {
      return { title: null, notes: [] }
    }
    const title = typeof parsed.title === 'string' && parsed.title.trim().length > 0
      ? parsed.title.trim()
      : null
    return { title, notes: sanitizeNotes(parsed.notes).slice(0, MAX_NOTES) }
  }

  /** 流结束时调用：放行残余 tail（分隔符未出现时它是正文，否则为空）。 */
  flushTail(): string {
    const emit = this.separatorSeen ? '' : this.tail
    this.tail = ''
    this.bodyEmitted += emit.length
    return emit
  }

  private drainBeforeSeparator(): string {
    const combined = this.tail + this.pending
    const index = combined.indexOf(META_SEPARATOR)
    if (index === -1) {
      // 没有完整分隔符：放行到安全位置，尾部扣住 HOLD_BACK 个字符
      const safeEnd = Math.max(0, combined.length - HOLD_BACK)
      const emit = combined.slice(0, safeEnd)
      this.tail = combined.slice(safeEnd)
      this.pending = ''
      this.bodyEmitted += emit.length
      return emit
    }
    this.separatorSeen = true
    const emit = combined.slice(0, index)
    this.metaRaw = combined.slice(index + META_SEPARATOR.length)
    this.tail = ''
    this.pending = ''
    this.bodyEmitted += emit.length
    return emit
  }
}
