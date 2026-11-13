/**
 * 提示词 diff 引擎（ARCHITECTURE §7）。
 *
 * 行级 LCS → 相邻 remove/add 块按索引配对 → 相似行做 Unicode code point 级
 * LCS 生成内联片段。超过阈值时退化为纯行级（`degraded: true`），不产生
 * modify，保证长文本不阻塞界面。
 *
 * 纯函数，无 IO；`DiffView` 只消费结果，不在这里以外计算 diff。
 */

export type DiffLineKind = 'same' | 'add' | 'remove' | 'modify'

export interface InlineSegment {
  kind: 'same' | 'add' | 'remove'
  text: string
}

export interface DiffRow {
  kind: DiffLineKind
  before?: string
  after?: string
  beforeSegments?: InlineSegment[]
  afterSegments?: InlineSegment[]
}

export interface DiffResult {
  rows: DiffRow[]
  stats: { added: number; removed: number; modified: number }
  degraded: boolean
}

export interface DiffOptions {
  maxChars?: number
  maxLines?: number
}

export const DEFAULT_DIFF_MAX_CHARS = 20000
export const DEFAULT_DIFF_MAX_LINES = 1200

/** 单侧超过该 code point 数时不做字符级 LCS，只给整行 modify。 */
const MAX_INLINE_CODE_POINTS = 2000
/** 行配对相似度下限。 */
const SIMILARITY_THRESHOLD = 0.3
/** 行级 LCS 的最大 DP 单元格数；超出时退化为整块 remove + add。 */
const MAX_DP_CELLS = 4_000_000

type LineOp =
  | { kind: 'same'; line: string }
  | { kind: 'remove'; line: string }
  | { kind: 'add'; line: string }

export function diffPromptLines(
  before: string,
  after: string,
  options: DiffOptions = {},
): DiffResult {
  const maxChars = options.maxChars ?? DEFAULT_DIFF_MAX_CHARS
  const maxLines = options.maxLines ?? DEFAULT_DIFF_MAX_LINES

  const beforeLines = splitLines(before)
  const afterLines = splitLines(after)

  // 任一侧超过字符或行数上限即退化（ARCHITECTURE §7：任一侧超过 20k 字符）
  const degraded =
    countCodePoints(before) > maxChars ||
    countCodePoints(after) > maxChars ||
    beforeLines.length > maxLines ||
    afterLines.length > maxLines

  const ops = diffLineOps(beforeLines, afterLines)
  const rows: DiffRow[] = []

  if (degraded) {
    for (const op of ops) {
      rows.push(rowFromOp(op))
    }
  } else {
    let index = 0
    while (index < ops.length) {
      const op = ops[index]
      if (op === undefined) break
      if (op.kind === 'same') {
        rows.push({ kind: 'same', before: op.line, after: op.line })
        index += 1
        continue
      }

      const removes: string[] = []
      const adds: string[] = []
      while (index < ops.length && ops[index]?.kind !== 'same') {
        const current = ops[index]
        if (current === undefined) break
        if (current.kind === 'remove') removes.push(current.line)
        else adds.push(current.line)
        index += 1
      }
      rows.push(...pairHunk(removes, adds))
    }
  }

  const stats = { added: 0, removed: 0, modified: 0 }
  for (const row of rows) {
    if (row.kind === 'add') stats.added += 1
    else if (row.kind === 'remove') stats.removed += 1
    else if (row.kind === 'modify') stats.modified += 1
  }

  return { rows, stats, degraded }
}

function splitLines(source: string): string[] {
  // CRLF 与 CR 统一成 LF；末尾单个换行不单独算一行
  const normalized = source.replace(/\r\n?/g, '\n')
  if (normalized === '') return []
  const lines = normalized.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function countCodePoints(text: string): number {
  let count = 0
  // for...of 按 code point 迭代，不额外分配整个字符数组
  for (const _point of text) count += 1
  return count
}

function rowFromOp(op: LineOp): DiffRow {
  if (op.kind === 'same') {
    return { kind: 'same', before: op.line, after: op.line }
  }
  if (op.kind === 'remove') {
    return { kind: 'remove', before: op.line }
  }
  return { kind: 'add', after: op.line }
}

/**
 * 行级 LCS：先裁公共前后缀，再对中段做滚动数组 DP。
 * 方向位存 Uint8Array，避免保存完整 Uint32 矩阵。
 */
function diffLineOps(before: string[], after: string[]): LineOp[] {
  const beforeCount = before.length
  const afterCount = after.length

  let prefix = 0
  while (
    prefix < beforeCount &&
    prefix < afterCount &&
    before[prefix] === after[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < beforeCount - prefix &&
    suffix < afterCount - prefix &&
    before[beforeCount - 1 - suffix] === after[afterCount - 1 - suffix]
  ) {
    suffix += 1
  }

  const ops: LineOp[] = []
  for (let index = 0; index < prefix; index += 1) {
    ops.push({ kind: 'same', line: before[index] as string })
  }
  ops.push(
    ...diffMiddleLines(
      before.slice(prefix, beforeCount - suffix),
      after.slice(prefix, afterCount - suffix),
    ),
  )
  for (let index = beforeCount - suffix; index < beforeCount; index += 1) {
    ops.push({ kind: 'same', line: before[index] as string })
  }
  return ops
}

function diffMiddleLines(before: string[], after: string[]): LineOp[] {
  const beforeCount = before.length
  const afterCount = after.length

  if (beforeCount === 0) {
    return after.map((line) => ({ kind: 'add', line }))
  }
  if (afterCount === 0) {
    return before.map((line) => ({ kind: 'remove', line }))
  }
  if (beforeCount * afterCount > MAX_DP_CELLS) {
    // 极端输入直接整块替换，保证退化路径有界
    return [
      ...before.map((line) => ({ kind: 'remove', line }) as const),
      ...after.map((line) => ({ kind: 'add', line }) as const),
    ]
  }

  const width = afterCount + 1
  let previous = new Uint32Array(width)
  let current = new Uint32Array(width)
  // 0 = 对角（相同），1 = 上（删除 before），2 = 左（新增 after）
  const direction = new Uint8Array((beforeCount + 1) * width)

  for (let i = 1; i <= beforeCount; i += 1) {
    const beforeLine = before[i - 1]
    for (let j = 1; j <= afterCount; j += 1) {
      const cell = i * width + j
      if (beforeLine === after[j - 1]) {
        current[j] = (previous[j - 1] as number) + 1
        direction[cell] = 0
      } else if ((previous[j] as number) > (current[j - 1] as number)) {
        current[j] = previous[j] as number
        direction[cell] = 1
      } else {
        // 平局时向左（新增），回溯后删除行排在新增行之前
        current[j] = current[j - 1] as number
        direction[cell] = 2
      }
    }
    const swap = previous
    previous = current
    current = swap
    current.fill(0)
  }

  const reversed: LineOp[] = []
  let i = beforeCount
  let j = afterCount
  while (i > 0 || j > 0) {
    if (i === 0) {
      reversed.push({ kind: 'add', line: after[j - 1] as string })
      j -= 1
      continue
    }
    if (j === 0) {
      reversed.push({ kind: 'remove', line: before[i - 1] as string })
      i -= 1
      continue
    }
    const move = direction[i * width + j]
    if (move === 0) {
      reversed.push({ kind: 'same', line: before[i - 1] as string })
      i -= 1
      j -= 1
    } else if (move === 1) {
      reversed.push({ kind: 'remove', line: before[i - 1] as string })
      i -= 1
    } else {
      reversed.push({ kind: 'add', line: after[j - 1] as string })
      j -= 1
    }
  }
  reversed.reverse()
  return reversed
}

/**
 * 相邻 remove/add 块按索引配对。两侧都非空且相似度达到阈值时合并为
 * modify；否则保留为独立的 remove 与 add 行。
 */
function pairHunk(removes: string[], adds: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  const count = Math.max(removes.length, adds.length)

  for (let index = 0; index < count; index += 1) {
    const beforeLine = removes[index]
    const afterLine = adds[index]

    if (beforeLine !== undefined && afterLine !== undefined) {
      if (
        beforeLine !== '' &&
        afterLine !== '' &&
        similarity(beforeLine, afterLine) >= SIMILARITY_THRESHOLD
      ) {
        rows.push(createModifyRow(beforeLine, afterLine))
      } else {
        rows.push({ kind: 'remove', before: beforeLine })
        rows.push({ kind: 'add', after: afterLine })
      }
    } else if (beforeLine !== undefined) {
      rows.push({ kind: 'remove', before: beforeLine })
    } else if (afterLine !== undefined) {
      rows.push({ kind: 'add', after: afterLine })
    }
  }

  return rows
}

function createModifyRow(before: string, after: string): DiffRow {
  const row: DiffRow = { kind: 'modify', before, after }
  if (
    countCodePoints(before) <= MAX_INLINE_CODE_POINTS &&
    countCodePoints(after) <= MAX_INLINE_CODE_POINTS
  ) {
    const segments = inlineSegments(before, after)
    row.beforeSegments = segments.before
    row.afterSegments = segments.after
  }
  return row
}

/** Dice 风格相似度：2 * LCS / (a + b)，按 code point 计算。 */
function similarity(before: string, after: string): number {
  const beforePoints = Array.from(before)
  const afterPoints = Array.from(after)
  if (beforePoints.length === 0 && afterPoints.length === 0) return 1
  if (beforePoints.length === 0 || afterPoints.length === 0) return 0

  // 超长行只取前缀估算，配对阶段不承担完整 O(n*m)
  const a =
    beforePoints.length > MAX_INLINE_CODE_POINTS
      ? beforePoints.slice(0, MAX_INLINE_CODE_POINTS)
      : beforePoints
  const b =
    afterPoints.length > MAX_INLINE_CODE_POINTS
      ? afterPoints.slice(0, MAX_INLINE_CODE_POINTS)
      : afterPoints

  return (2 * lcsLength(a, b)) / (a.length + b.length)
}

/** code point 级 LCS 长度，滚动数组。 */
function lcsLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const width = b.length + 1
  let previous = new Uint32Array(width)
  let current = new Uint32Array(width)

  for (let i = 1; i <= a.length; i += 1) {
    const aPoint = a[i - 1]
    for (let j = 1; j <= b.length; j += 1) {
      if (aPoint === b[j - 1]) {
        current[j] = (previous[j - 1] as number) + 1
      } else {
        const up = previous[j] as number
        const left = current[j - 1] as number
        current[j] = up >= left ? up : left
      }
    }
    const swap = previous
    previous = current
    current = swap
    current.fill(0)
  }

  return previous[b.length] as number
}

interface InlineSegments {
  before: InlineSegment[]
  after: InlineSegment[]
}

/**
 * 字符级 LCS 生成内联片段。使用 code point 数组，emoji 与代理对不会被拆开。
 */
function inlineSegments(before: string, after: string): InlineSegments {
  const a = Array.from(before)
  const b = Array.from(after)
  const aCount = a.length
  const bCount = b.length
  const width = bCount + 1

  let previous = new Uint32Array(width)
  let current = new Uint32Array(width)
  const direction = new Uint8Array((aCount + 1) * width)

  for (let i = 1; i <= aCount; i += 1) {
    const point = a[i - 1]
    for (let j = 1; j <= bCount; j += 1) {
      const cell = i * width + j
      if (point === b[j - 1]) {
        current[j] = (previous[j - 1] as number) + 1
        direction[cell] = 0
      } else if ((previous[j] as number) > (current[j - 1] as number)) {
        current[j] = previous[j] as number
        direction[cell] = 1
      } else {
        current[j] = current[j - 1] as number
        direction[cell] = 2
      }
    }
    const swap = previous
    previous = current
    current = swap
    current.fill(0)
  }

  const reversed: Array<{
    kind: 'same' | 'add' | 'remove'
    text: string
  }> = []
  let i = aCount
  let j = bCount
  while (i > 0 || j > 0) {
    if (i === 0) {
      reversed.push({ kind: 'add', text: b[j - 1] as string })
      j -= 1
      continue
    }
    if (j === 0) {
      reversed.push({ kind: 'remove', text: a[i - 1] as string })
      i -= 1
      continue
    }
    const move = direction[i * width + j]
    if (move === 0) {
      reversed.push({ kind: 'same', text: a[i - 1] as string })
      i -= 1
      j -= 1
    } else if (move === 1) {
      reversed.push({ kind: 'remove', text: a[i - 1] as string })
      i -= 1
    } else {
      reversed.push({ kind: 'add', text: b[j - 1] as string })
      j -= 1
    }
  }
  reversed.reverse()

  const beforeSegments: InlineSegment[] = []
  const afterSegments: InlineSegment[] = []

  for (const op of reversed) {
    if (op.kind === 'same') {
      pushSegment(beforeSegments, 'same', op.text)
      pushSegment(afterSegments, 'same', op.text)
    } else if (op.kind === 'remove') {
      pushSegment(beforeSegments, 'remove', op.text)
    } else {
      pushSegment(afterSegments, 'add', op.text)
    }
  }

  return { before: beforeSegments, after: afterSegments }
}

function pushSegment(
  segments: InlineSegment[],
  kind: InlineSegment['kind'],
  text: string,
): void {
  const last = segments[segments.length - 1]
  if (last !== undefined && last.kind === kind) {
    last.text += text
  } else {
    segments.push({ kind, text })
  }
}
