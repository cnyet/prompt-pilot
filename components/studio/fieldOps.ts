import { composePrompt } from '@/lib/engine/compose'
import {
  auditFieldContent,
  extractLeaves,
  findUnmappedLines,
  matchFieldLinePrefix,
  parseField,
  type FieldLeaf,
} from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import type { FieldKey } from '@/lib/engine/schema'
import { FIELD_OP_LABELS, type FieldOp } from './types'

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
 * 内容安全（工单 16）：所有操作都只在「解析器能单独识别的最小段落」上增删，
 * 无法识别的游离行原样保留。重算结果若仍会丢行，整次操作拒绝执行并给出
 * 结构化错误，原文不变。`applyFieldOpSafely` 是带结果的入口；`applyFieldOp`
 * 保留字符串返回值，拒绝时原样返回入参，调用方据此不会写回截断文本。
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

export type FieldOpRejectionCode = 'UNSAFE_CONTENT' | 'NO_SAFE_CHANGE'

/** 拒绝执行的说明。`lines` 直接对应原文行，路由放进响应 detail。 */
export interface FieldOpRejection {
  ok: false
  code: FieldOpRejectionCode
  /** 无法安全处理的行，保持原文顺序。 */
  lines: string[]
  /** 三段式说明，包含上面每一行。 */
  message: string
}

export interface FieldOpSuccess {
  ok: true
  text: string
  /** 本次操作原样保全的、解析器无法单独识别的行。 */
  preservedLines: string[]
}

export type FieldOpOutcome = FieldOpSuccess | FieldOpRejection

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
const MAX_LINES_IN_MESSAGE = 12

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

/** 在没有可改写的叶子时追加一行，避免改到用户已有的整行文本。 */
function appendLine(text: string, addition: string): string {
  if (text.endsWith('\n')) {
    return `${text}${addition}`
  }
  return `${text}\n${addition}`
}

/**
 * 无叶子可改时的追加策略：规范文本沿用原来的句内追加，保持旧版输出；
 * 非规范文本追加新行，保证既有每一行都原样活着。
 */
function appendByMode(
  text: string,
  addition: string,
  canonical: boolean,
): string {
  return canonical ? appendClause(text, addition) : appendLine(text, addition)
}

/**
 * 叶子可改写的区间。值跨行时只取第一行，续行原样保留。
 * 与 `paths.ts` 的叶子写回规则一致，保证两条写回链路不会互相打脸。
 */
function leafValueSpan(leaf: FieldLeaf): ValuePatch {
  const newline = leaf.value.indexOf('\n')
  if (newline === -1) {
    return { start: leaf.start, end: leaf.end, value: leaf.value }
  }
  return {
    start: leaf.start,
    end: leaf.start + newline,
    value: leaf.value.slice(0, newline),
  }
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

function lengthen(
  field: FieldKey,
  text: string,
  canonical: boolean,
): string {
  const leaves = extractLeaves(field, text)
    .filter((leaf) => leaf.value.trim().length > 0 && isFreeTextLeaf(leaf))
    .slice(0, MAX_LEAVES_TOUCHED)

  if (leaves.length === 0) {
    return appendByMode(
      text,
      pick(LENGTHEN_CLAUSES, `${field}:${text}`),
      canonical,
    )
  }

  const patches: ValuePatch[] = leaves.map((leaf, index) => {
    const span = leafValueSpan(leaf)
    return {
      start: span.start,
      end: span.end,
      value: appendClause(
        span.value,
        pick(LENGTHEN_CLAUSES, `${leaf.path}:${leaf.value}:${index}`),
      ),
    }
  })
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

/** 压缩一行里的值，保留原来的句末标点，避免把陈述句改成残句。 */
function compressLineValue(value: string): string {
  const compressed = compressValue(value)
  if (compressed === value) {
    return value
  }
  if (value.endsWith('。') && !compressed.endsWith('。')) {
    return `${compressed}。`
  }
  return compressed
}

/**
 * 行级降级：只压缩带标签行的值，游离行与空行逐字保留。
 * 没有任何一行变短时返回 null，由调用方拒绝本次操作。
 */
function shortenMappedLines(field: FieldKey, text: string): string | null {
  const unmappedStarts = new Set(
    findUnmappedLines(field, text).map((line) => line.start),
  )
  let offset = 0
  let changed = false
  const lines = text.split('\n').map((lineText) => {
    const lineStart = offset
    offset += lineText.length + 1
    if (lineText.trim().length === 0 || unmappedStarts.has(lineStart)) {
      return lineText
    }
    const prefix = matchFieldLinePrefix(field, lineText)
    if (prefix === null) {
      return lineText
    }
    const value = lineText.slice(prefix.length)
    if (value.trim().length === 0) {
      return lineText
    }
    const compressed = compressLineValue(value)
    if (compressed === value) {
      return lineText
    }
    changed = true
    return `${prefix}${compressed}`
  })
  return changed ? lines.join('\n') : null
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

  const remainingLeaves = extractLeaves(field, withoutExtraItems)
    .filter((leaf) => isFreeTextLeaf(leaf))
    // 跨行叶子的续行必须原样保留，因此整片跳过，只压缩单行值。
    .filter((leaf) => leaf.value.indexOf('\n') === -1)
    .filter((leaf) => Array.from(leaf.value).length > 8)
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
  return shortenMappedLines(field, text) ?? text
}

function specific(
  field: FieldKey,
  text: string,
  canonical: boolean,
): string {
  const leaves = extractLeaves(field, text)
    .filter((leaf) => leaf.value.trim().length > 0 && isFreeTextLeaf(leaf))
    .slice(0, MAX_LEAVES_TOUCHED)

  if (leaves.length === 0) {
    return appendByMode(
      text,
      pick(SPECIFIC_SUFFIXES, `${field}:${text}`),
      canonical,
    )
  }

  const patches: ValuePatch[] = leaves.map((leaf, index) => {
    const span = leafValueSpan(leaf)
    return {
      start: span.start,
      end: span.end,
      value: specifyValue(span.value, `${leaf.path}:${leaf.value}:${index}`),
    }
  })
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

  const first = leaves.find(
    (leaf) => leaf.value.trim().length > 0 && isFreeTextLeaf(leaf),
  )
  if (first && !first.value.includes('（重算版本：')) {
    const span = leafValueSpan(first)
    return applyValuePatches(text, [
      {
        start: span.start,
        end: span.end,
        value: `${span.value}（重算版本：按当前约束复核）`,
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
  canonical: boolean,
): string {
  // 整段重写只在原文能无损往返时允许；否则只做行级重排与补充。
  if (canonical) {
    const composed = composeVariant(field, text, context)
    if (composed !== null) {
      return composed
    }
  }
  const restructured = restructure(field, text)
  if (restructured !== text) {
    return restructured
  }
  return appendByMode(text, '按当前约束换一种组织方式。', canonical)
}

function runFieldOp(
  field: FieldKey,
  text: string,
  op: FieldOp,
  context: FieldOpContext,
  canonical: boolean,
): string {
  switch (op) {
    case 'lengthen':
      return lengthen(field, text, canonical)
    case 'shorten':
      return shorten(field, text)
    case 'specific':
      return specific(field, text, canonical)
    case 'regenerate':
      return regenerate(field, text, context, canonical)
    default: {
      const exhaustive: never = op
      throw new Error(`未知操作：${String(exhaustive)}`)
    }
  }
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function formatLineList(lines: readonly string[]): string {
  const shown = lines
    .slice(0, MAX_LINES_IN_MESSAGE)
    .map((line, index) => `${index + 1}. ${line}`)
  if (lines.length > MAX_LINES_IN_MESSAGE) {
    shown.push(
      `另有 ${lines.length - MAX_LINES_IN_MESSAGE} 行，详见响应 detail.lines。`,
    )
  }
  return shown.join('\n')
}

function makeRejection(
  code: FieldOpRejectionCode,
  op: FieldOp,
  lines: readonly string[],
): FieldOpRejection {
  const label = FIELD_OP_LABELS[op]
  const what =
    code === 'UNSAFE_CONTENT'
      ? `发生了什么：这次「${label}」会丢下面这些行，已放弃执行，原文保持不变。`
      : `发生了什么：这次「${label}」没有能在保全原文的前提下改动的内容，已放弃执行，原文保持不变。`
  const why =
    code === 'UNSAFE_CONTENT'
      ? '为什么：这些行没有被识别成可单独改写的最小段落，整段重写会把它们一起带走。'
      : '为什么：这些行都是不可再拆的最小内容，继续缩短只能删除原文信息。'
  const how =
    code === 'UNSAFE_CONTENT'
      ? '怎么办：先手动改写这些行或给它们补上字段标签，然后重试。'
      : '怎么办：先手动精简不需要的句子，或换用「更具体」等其他操作。'
  const heading = code === 'UNSAFE_CONTENT' ? '无法保留的行：' : '无法处理的行：'
  return {
    ok: false,
    code,
    lines: [...lines],
    message: [what, why, how, heading, formatLineList(lines)].join('\n'),
  }
}

function findLostLines(
  protectedLines: readonly string[],
  candidate: string,
): string[] {
  if (protectedLines.length === 0) {
    return []
  }
  const present = new Set(nonEmptyLines(candidate))
  return protectedLines.filter((line) => !present.has(line))
}

/**
 * 对单个字段执行一次重算，并保证内容安全。
 *
 * 策略是「行级降级优先」：所有操作只改带标签的结构行，解析器无法识别的
 * 游离行原样保留；只有降级后仍然会丢行，或降级后没有任何改动时，才拒绝
 * 执行。拒绝不改动入参，调用方应把原文原样留在文档里。
 */
export function applyFieldOpSafely(
  field: FieldKey,
  text: string,
  op: FieldOp,
  context: FieldOpContext = {},
): FieldOpOutcome {
  if (text.trim().length === 0) {
    return { ok: true, text, preservedLines: [] }
  }

  const audit = auditFieldContent(field, text)
  const protectedLines = audit.unmappedLines.map((line) => line.text.trim())
  const candidate = runFieldOp(field, text, op, context, audit.canonical)

  const lost = findLostLines(protectedLines, candidate)
  if (lost.length > 0) {
    return makeRejection('UNSAFE_CONTENT', op, lost)
  }

  if (candidate === text) {
    const lines = nonEmptyLines(text)
    return makeRejection(
      'NO_SAFE_CHANGE',
      op,
      lines.length > 0 ? lines : protectedLines,
    )
  }

  return { ok: true, text: candidate, preservedLines: protectedLines }
}

/**
 * 对单个字段执行一次重算。返回的文本可直接写回该字段。
 *
 * 内容安全拒绝时原样返回入参，保证按字符串使用也不会写回丢内容的文本；
 * 需要区分「拒绝」与「执行成功」时改用 `applyFieldOpSafely`。
 */
export function applyFieldOp(
  field: FieldKey,
  text: string,
  op: FieldOp,
  context: FieldOpContext = {},
): string {
  const outcome = applyFieldOpSafely(field, text, op, context)
  return outcome.ok ? outcome.text : text
}

/**
 * 校验重算结果确实只包含目标字段的结构。
 * 供测试与路由做防御性检查：若解析结果里出现其他字段的路径，说明实现越界。
 */
export function leavesBelongToField(field: FieldKey, text: string): boolean {
  const parsed = parseField(field, text)
  return parsed.leaves.every((leaf) => leaf.field === field)
}
