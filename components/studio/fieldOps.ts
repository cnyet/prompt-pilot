import { composePrompt } from '@/lib/engine/compose'
import { extractLeaves, parseField, type FieldLeaf } from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import type { FieldKey } from '@/lib/engine/schema'
import type { FieldOp } from './types'

/**
 * 单字段重算的离线启发式实现。
 *
 * 约束与 compose 一致：纯函数、确定性、无 IO。同一段字段文本与同一个操作
 * 永远得到同一结果；四种操作产出四种肉眼可辨的差异：
 *
 * - 加长：给至多 6 个叶子补一句具体的判断依据或例子；
 * - 缩短：每个列表只保留前两项，并压缩长句；
 * - 更具体：把模糊限定词换成数量或判据，没命中时补一条可核对口径；
 * - 重新生成：优先按原始需求重新 compose，文本没变时改为重排列表并补口径。
 *
 * 有模型时这里仍是离线降级路径；接入模型只替换本文件的实现，路由与文档
 * 写入规则不变。返回的新文本只包含目标字段，其他字段由调用方逐字保留。
 */

export interface FieldOpContext {
  /** 用户最初提交的需求，用于「重新生成」。 */
  requirement?: string
  /** 文档标题，需求缺失时的降级输入。 */
  title?: string
}

interface ValuePatch {
  start: number
  end: number
  value: string
}

interface LineRange {
  start: number
  end: number
}

const LENGTHEN_CLAUSES = [
  '并说明可核对的判断依据。',
  '同时给出适用范围与例外情况。',
  '附上一条可验证的例子。',
  '标出依赖关系与验收方式。',
] as const

const SPECIFIC_SUFFIXES = [
  '（判据：3 条可核对依据）',
  '（范围：覆盖 2 个边界）',
  '（数量：3 到 5 项）',
  '（口径：满足即可通过校验）',
] as const

const VAGUE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/尽量/gu, '按 3 条要点'],
  [/适当/gu, '按 2 处'],
  [/一些/gu, '3 到 5 个'],
  [/若干/gu, '3 个'],
  [/必要时/gu, '在缺口超过 2 项时'],
  [/比较好/gu, '满足可核对标准'],
  [/等等/gu, '以及 2 个同类项'],
  [/相关的/gu, '与任务直接相关的 2 到 3 个'],
  [/专业/gu, '符合行业术语规范'],
  [/高质量/gu, '满足 3 条验收标准'],
]

const MAX_LEAVES_TOUCHED = 6
const MAX_LIST_ITEMS_KEPT = 2

/**
 * 这些叶子的取值来自枚举或受格式约束，追加自然语言会把它们写坏：
 * `output.format` 要能被反查回 OutputFormat，变量名要匹配标识符正则，
 * 变量类型与必填是固定选项，可选值用 ` / ` 分隔。加长与更具体都跳过它们。
 */
const STRUCTURED_LEAF_PATTERNS: readonly RegExp[] = [
  /^output\.format$/u,
  /^input\.variables\[\d+\]\.(?:name|type|required|options)$/u,
]

function isFreeTextLeaf(leaf: FieldLeaf): boolean {
  return !STRUCTURED_LEAF_PATTERNS.some((pattern) => pattern.test(leaf.path))
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function pick<T>(items: readonly T[], seed: string): T {
  const index = hashText(seed) % items.length
  const picked = items[index]
  if (picked === undefined) {
    throw new Error('候选列表不能为空。')
  }
  return picked
}

function applyValuePatches(text: string, patches: readonly ValuePatch[]): string {
  const sorted = [...patches].sort((left, right) => right.start - left.start)
  let next = text
  for (const patch of sorted) {
    next = `${next.slice(0, patch.start)}${patch.value}${next.slice(patch.end)}`
  }
  return next
}

function applyLineRemovals(text: string, ranges: readonly LineRange[]): string {
  const sorted = [...ranges].sort((left, right) => right.start - left.start)
  let next = text
  for (const range of sorted) {
    next = `${next.slice(0, range.start)}${next.slice(range.end)}`
  }
  return next
}

function lineRemovalRange(text: string, leaf: FieldLeaf): LineRange {
  const newlineAfter = text.indexOf('\n', leaf.lineEnd)
  if (newlineAfter === leaf.lineEnd) {
    return { start: leaf.lineStart, end: leaf.lineEnd + 1 }
  }
  // 最后一行没有换行符，连带吃掉前一行的换行，避免留下空行。
  if (leaf.lineStart > 0 && text.charAt(leaf.lineStart - 1) === '\n') {
    return { start: leaf.lineStart - 1, end: leaf.lineEnd }
  }
  return { start: leaf.lineStart, end: leaf.lineEnd }
}

function appendClause(value: string, clause: string): string {
  if (value.length === 0) {
    return clause
  }
  if (/[。！？!?，、；;,：:]$/u.test(value)) {
    return `${value}${clause}`
  }
  return `${value}，${clause}`
}

function specifyValue(value: string, seed: string): string {
  let next = value
  for (const [pattern, replacement] of VAGUE_REPLACEMENTS) {
    next = next.replace(pattern, replacement)
  }
  if (next !== value) {
    return next
  }
  if (value.includes('（判据：') || value.includes('（口径：')) {
    return value
  }
  return `${value}${pick(SPECIFIC_SUFFIXES, seed)}`
}

function itemIndex(leaf: FieldLeaf): number | null {
  const match = /\[(\d+)\]$/u.exec(leaf.path)
  if (!match) {
    return null
  }
  const parsed = Number.parseInt(match[1] ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

function collectionOf(leaf: FieldLeaf): string {
  return leaf.path.replace(/\[\d+\]$/u, '')
}

function lengthen(field: FieldKey, text: string): string {
  const leaves = extractLeaves(field, text)
    .filter((leaf) => leaf.value.trim().length > 0 && isFreeTextLeaf(leaf))
    .slice(0, MAX_LEAVES_TOUCHED)

  if (leaves.length === 0) {
    return appendClause(text, pick(LENGTHEN_CLAUSES, `${field}:${text}`))
  }

  const patches: ValuePatch[] = leaves.map((leaf, index) => ({
    start: leaf.start,
    end: leaf.end,
    value: appendClause(
      leaf.value,
      pick(LENGTHEN_CLAUSES, `${leaf.path}:${leaf.value}:${index}`),
    ),
  }))
  return applyValuePatches(text, patches)
}

function compressValue(value: string): string {
  const firstClause = value.split(/[。！？!?；;]/u)[0]?.trim() ?? ''
  if (
    firstClause.length > 0 &&
    Array.from(firstClause).length < Array.from(value).length
  ) {
    return firstClause.replace(/[，、；;,：:]$/u, '')
  }
  const chars = Array.from(value)
  if (chars.length > 18) {
    return chars
      .slice(0, 16)
      .join('')
      .replace(/[，、；;,：:]$/u, '')
  }
  return value
}

function shortenPlainText(text: string): string {
  const trimmed = text.trim()
  const firstSentence = trimmed.split(/[。！？!?\n]/u)[0]?.trim() ?? ''
  if (firstSentence.length > 0 && firstSentence.length < trimmed.length) {
    return `${firstSentence}${trimmed.includes('。') ? '。' : ''}`
  }
  const chars = Array.from(trimmed)
  if (chars.length > 8) {
    return `${chars
      .slice(0, Math.max(4, Math.floor(chars.length * 0.6)))
      .join('')
      .replace(/[，、；;,：:]$/u, '')}。`
  }
  return trimmed
}

function shorten(field: FieldKey, text: string): string {
  const leaves = extractLeaves(field, text)

  const removals: LineRange[] = []
  const keptByCollection = new Map<string, number>()
  for (const leaf of leaves) {
    if (leaf.kind !== 'list-item') {
      continue
    }
    const collection = collectionOf(leaf)
    const index = itemIndex(leaf)
    if (index === null) {
      continue
    }
    const kept = keptByCollection.get(collection) ?? 0
    if (kept >= MAX_LIST_ITEMS_KEPT) {
      removals.push(lineRemovalRange(text, leaf))
      continue
    }
    keptByCollection.set(collection, kept + 1)
  }

  const withoutExtraItems =
    removals.length > 0 ? applyLineRemovals(text, removals) : text

  const remainingLeaves = extractLeaves(field, withoutExtraItems).filter(
    (leaf) => Array.from(leaf.value).length > 8,
  )
  const patches: ValuePatch[] = []
  for (const leaf of remainingLeaves) {
    const next = compressValue(leaf.value)
    if (next !== leaf.value && next.length > 0) {
      patches.push({ start: leaf.start, end: leaf.end, value: next })
    }
  }

  const next =
    patches.length > 0
      ? applyValuePatches(withoutExtraItems, patches)
      : withoutExtraItems
  if (next !== text) {
    return next
  }
  return shortenPlainText(text)
}

function specific(field: FieldKey, text: string): string {
  const leaves = extractLeaves(field, text)
    .filter((leaf) => leaf.value.trim().length > 0 && isFreeTextLeaf(leaf))
    .slice(0, MAX_LEAVES_TOUCHED)

  if (leaves.length === 0) {
    return `${text}${pick(SPECIFIC_SUFFIXES, `${field}:${text}`)}`
  }

  const patches: ValuePatch[] = leaves.map((leaf, index) => ({
    start: leaf.start,
    end: leaf.end,
    value: specifyValue(leaf.value, `${leaf.path}:${leaf.value}:${index}`),
  }))
  return applyValuePatches(text, patches)
}

function restructure(field: FieldKey, text: string): string {
  const leaves = extractLeaves(field, text)
  const groups = new Map<string, FieldLeaf[]>()
  for (const leaf of leaves) {
    if (leaf.kind !== 'list-item') {
      continue
    }
    const collection = collectionOf(leaf)
    const group = groups.get(collection) ?? []
    group.push(leaf)
    groups.set(collection, group)
  }

  const patches: ValuePatch[] = []
  for (const group of groups.values()) {
    const ordered = [...group].sort(
      (left, right) => (itemIndex(left) ?? 0) - (itemIndex(right) ?? 0),
    )
    const values = ordered.map((leaf) => leaf.value)
    const reversed = [...values].reverse()
    ordered.forEach((leaf, index) => {
      const nextValue = reversed[index]
      if (nextValue !== undefined && nextValue !== leaf.value) {
        patches.push({ start: leaf.start, end: leaf.end, value: nextValue })
      }
    })
  }

  if (patches.length > 0) {
    return applyValuePatches(text, patches)
  }

  const first = leaves.find((leaf) => leaf.value.trim().length > 0)
  if (first && !first.value.includes('（重算版本：')) {
    return applyValuePatches(text, [
      {
        start: first.start,
        end: first.end,
        value: `${first.value}（重算版本：按当前约束复核）`,
      },
    ])
  }
  return text
}

function composeVariant(
  field: FieldKey,
  text: string,
  context: FieldOpContext,
): string | null {
  const source = (context.requirement ?? context.title ?? '').trim()
  if (source.length < 2) {
    return null
  }
  try {
    const schema = composePrompt(source)
    const next = renderFieldText(schema, field).trimEnd()
    if (next.length > 0 && next !== text.trimEnd()) {
      return next
    }
  } catch {
    return null
  }
  return null
}

function regenerate(
  field: FieldKey,
  text: string,
  context: FieldOpContext,
): string {
  const composed = composeVariant(field, text, context)
  if (composed !== null) {
    return composed
  }
  const restructured = restructure(field, text)
  if (restructured !== text) {
    return restructured
  }
  return appendClause(text, '按当前约束换一种组织方式。')
}

/** 对单个字段执行一次重算。返回的文本可直接写回该字段。 */
export function applyFieldOp(
  field: FieldKey,
  text: string,
  op: FieldOp,
  context: FieldOpContext = {},
): string {
  if (text.trim().length === 0) {
    return text
  }
  switch (op) {
    case 'lengthen':
      return lengthen(field, text)
    case 'shorten':
      return shorten(field, text)
    case 'specific':
      return specific(field, text)
    case 'regenerate':
      return regenerate(field, text, context)
    default: {
      const exhaustive: never = op
      throw new Error(`未知操作：${String(exhaustive)}`)
    }
  }
}

/**
 * 校验重算结果确实只包含目标字段的结构。
 * 供测试与路由做防御性检查：若解析结果里出现其他字段的路径，说明实现越界。
 */
export function leavesBelongToField(field: FieldKey, text: string): boolean {
  const parsed = parseField(field, text)
  return parsed.leaves.every((leaf) => leaf.field === field)
}
