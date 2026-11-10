import {
  auditFieldContent,
  buildSchemaFromFields,
  extractLeaves,
  fieldKeyOfPath,
  matchFieldLinePrefix,
  readLeafValue,
  replaceLeafValue,
  SUPPORTED_ASSUMPTION_PATHS,
} from './paths'
import { FORMAT_LABELS, renderFieldText } from './render'
import {
  type Assumption,
  type FieldKey,
  type OutputFormat,
  type PromptSchema,
} from './schema'

/**
 * 假设 chip（工单 04）的纯函数层。
 *
 * 数据源是 `schema.assumptions`：模型在生成期替用户做的决定。这里只做三件事：
 * 1. 把假设整理成可展示、可选择的 chip，缺少的约定路径用字段文本补齐；
 * 2. 用户改一个 chip 时，只改该假设路径对应的那一个字段，其余字段逐字不变；
 * 3. 为导出（工单 12）准备「是否剔除假设注释」的数据。
 *
 * 写回规则复用 `paths.ts` 的 `replaceLeafValue`：只替换叶子值，跨行叶子的续行
 * 原样保留，因此工单 16 的内容保全在这里同样生效。字段里没有该行时，只在
 * 「解析再渲染能覆盖全部原文行」的规范文本上补一行，其他情况拒绝写入。
 */

export type AssumptionPath = (typeof SUPPORTED_ASSUMPTION_PATHS)[number]

export interface AssumptionDefinition {
  readonly path: AssumptionPath
  readonly label: string
  readonly targetField: FieldKey
  readonly candidates: readonly string[]
}

const FORMAT_BY_LABEL: ReadonlyMap<string, OutputFormat> = new Map(
  (Object.keys(FORMAT_LABELS) as OutputFormat[]).map((format) => [
    FORMAT_LABELS[format],
    format,
  ]),
)

const FORMAT_LABELS_IN_ORDER: readonly string[] = (
  Object.keys(FORMAT_LABELS) as OutputFormat[]
).map((format) => FORMAT_LABELS[format])

/**
 * 五条约定路径与它们的候选值。
 *
 * 顺序与工单验收一致：输出语言、长度量级、输出格式、受众、语气。候选值只是
 * 默认建议，模型给出的候选会并进来；当前字段里的值永远排在第一位。
 */
export const ASSUMPTION_DEFINITIONS: readonly AssumptionDefinition[] = [
  {
    path: 'output.language',
    label: '输出语言',
    targetField: 'output',
    candidates: ['中文', '英文'],
  },
  {
    path: 'output.length',
    label: '长度量级',
    targetField: 'output',
    candidates: ['300 到 600 字', '600 到 1200 字', '按需'],
  },
  {
    path: 'output.format',
    label: '输出格式',
    targetField: 'output',
    candidates: FORMAT_LABELS_IN_ORDER,
  },
  {
    path: 'context.audience',
    label: '受众',
    targetField: 'context',
    candidates: ['普通读者', '团队成员', '业务负责人', '下游程序'],
  },
  {
    path: 'output.tone',
    label: '语气',
    targetField: 'output',
    candidates: ['专业、克制、直接', '简洁、口语化', '严谨、正式', '温和、共情'],
  },
]

export const ASSUMPTION_SOURCE_LABELS: Record<Assumption['source'], string> = {
  default: '模板默认',
  inferred: '按需求推断',
  user: '你改过',
}

function definitionOf(path: string): AssumptionDefinition | null {
  return ASSUMPTION_DEFINITIONS.find((item) => item.path === path) ?? null
}

export function isAssumptionPath(value: unknown): value is AssumptionPath {
  return typeof value === 'string' && definitionOf(value) !== null
}

/** 输出格式的候选与写入值必须能反查回枚举，否则渲染层会退回 markdown。 */
function canonicalFormatLabel(value: string): string | null {
  const trimmed = value.trim()
  if (FORMAT_BY_LABEL.has(trimmed)) {
    return trimmed
  }
  const byKey = FORMAT_LABELS[trimmed as OutputFormat]
  return byKey ?? null
}

export function normalizeAssumptionValue(
  path: string,
  value: string,
): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (path === 'output.format') {
    return canonicalFormatLabel(trimmed)
  }
  return definitionOf(path) === null ? null : trimmed
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) {
      continue
    }
    seen.add(value)
    output.push(value)
  }
  return output
}

export interface AssumptionChipInput {
  /** 当前八字段文本。chip 的当前值以字段文本为准，手改后也会立即反映。 */
  readonly fields: Partial<Record<FieldKey, string>>
  /** 生成期假设。缺少某条路径时由字段文本与默认候选补齐。 */
  readonly assumptions?: readonly Assumption[]
  /** 用户改过的假设路径，用于「已改」标记。 */
  readonly editedPaths?: readonly string[]
}

export interface AssumptionChip {
  readonly path: AssumptionPath
  readonly label: string
  readonly value: string
  readonly candidates: readonly string[]
  readonly source: Assumption['source']
  readonly targetField: FieldKey
  /** 用户改过这一条。未改过的 chip 在界面上保持低调。 */
  readonly modified: boolean
  /** 字段文本里已经有这一行，可以直接按叶子写回。 */
  readonly present: boolean
  /** 可以安全写入：已有该行，或字段是规范格式、补一行不会丢内容。 */
  readonly applicable: boolean
}

/**
 * 生成 chip 列表。永远返回五条，保证生成完成后中栏顶部有一排完整的假设。
 *
 * 当前值优先读字段文本里的叶子，这样用户手改字段后 chip 不会显示过期值；
 * 字段里没有这一行时才退回假设值或默认候选。`applicable` 为 false 的 chip
 * 表示当前字段是非规范文本且缺这一行，补写会丢内容，界面应禁用。
 */
export function buildAssumptionChips(
  input: AssumptionChipInput,
): AssumptionChip[] {
  const edited = new Set(input.editedPaths ?? [])
  const assumptions = input.assumptions ?? []

  return ASSUMPTION_DEFINITIONS.map((definition) => {
    const text = input.fields[definition.targetField] ?? ''
    const presentLeaf = readLeafValue(
      definition.targetField,
      text,
      definition.path,
    )
    // 叶子存在但值不合法（例如手改成「格式：PDF」）时，chip 展示一个合法
    // 候选，避免把非法值当成当前值再让点击失败。
    const leafValue =
      presentLeaf === null
        ? null
        : normalizeAssumptionValue(definition.path, presentLeaf)
    const assumption = assumptions.find(
      (item) => item.path === definition.path,
    )
    const fallback =
      assumption === undefined
        ? null
        : normalizeAssumptionValue(definition.path, assumption.value)
    const value =
      leafValue ?? fallback ?? definition.candidates[0] ?? ''
    const candidates = unique([
      value,
      ...(assumption?.candidates ?? [])
        .map((candidate) =>
          normalizeAssumptionValue(definition.path, candidate),
        )
        .filter((candidate): candidate is string => candidate !== null),
      ...definition.candidates,
    ])
    const textIsUsable = text.trim().length > 0
    const applicable =
      textIsUsable &&
      (presentLeaf !== null ||
        auditFieldContent(definition.targetField, text).canonical)

    return {
      path: definition.path,
      label: definition.label,
      value,
      candidates,
      source:
        assumption?.source ??
        (presentLeaf === null ? 'default' : 'inferred'),
      targetField: definition.targetField,
      modified: edited.has(definition.path),
      present: presentLeaf !== null,
      applicable,
    }
  })
}

export function assumptionFromChip(chip: AssumptionChip): Assumption {
  return {
    path: chip.path,
    label: chip.label,
    value: chip.value,
    candidates: [...chip.candidates],
    source: chip.source,
  }
}

/**
 * 用 chip 的当前值覆盖假设列表里的同名路径，并保留模型给出的其他假设。
 * 这样撤销 chip 修改后，`doc.schema.assumptions` 也会跟着字段文本回退。
 */
export function mergeAssumptions(
  base: readonly Assumption[],
  chips: readonly AssumptionChip[],
): Assumption[] {
  const chipPaths = new Set<string>(chips.map((chip) => chip.path))
  const extras = base.filter((assumption) => !chipPaths.has(assumption.path))
  return [...extras, ...chips.map(assumptionFromChip)]
}

/** 把用户选择的假设值写回假设列表，来源标成 user。 */
export function upsertAssumption(
  base: readonly Assumption[],
  path: AssumptionPath,
  value: string,
): Assumption[] {
  const definition = definitionOf(path)
  const normalized = normalizeAssumptionValue(path, value)
  if (definition === null || normalized === null) {
    return [...base]
  }
  const existing = base.find((assumption) => assumption.path === path)
  const next: Assumption = {
    path,
    label: definition.label,
    value: normalized,
    candidates: unique([
      normalized,
      ...(existing?.candidates ?? []),
      ...definition.candidates,
    ]),
    source: 'user',
  }
  if (existing === undefined) {
    return [...base, next]
  }
  return base.map((assumption) =>
    assumption.path === path ? next : assumption,
  )
}

export type AssumptionWriteFailure =
  | 'unsupported-path'
  | 'invalid-value'
  | 'empty-field'
  | 'unsafe-content'

export type AssumptionWrite =
  | {
      ok: true
      path: AssumptionPath
      field: FieldKey
      text: string
      mode: 'leaf' | 'render'
    }
  | {
      ok: false
      path: string
      reason: AssumptionWriteFailure
      field: FieldKey | null
      text: string
    }

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * 补行后的安全检查，比单纯的「行还在」更严格：
 *
 * 1. 原有叶子全部保留且值不变；
 * 2. 除目标路径外不新增任何叶子；
 * 3. 渲染结果除目标行外不新增非空行（例如 `章节：无` 这类渲染器补出来的
 *    默认行），否则这次补写会把无关内容带进字段，整次拒绝。
 */
function fallbackIsSafe(
  field: FieldKey,
  original: string,
  next: string,
  path: AssumptionPath,
  value: string,
): boolean {
  const before = extractLeaves(field, original)
  const after = extractLeaves(field, next)
  const target = after.find((leaf) => leaf.path === path)
  if (!target || target.value !== value) {
    return false
  }

  const beforeValues = new Map(
    before.map((leaf) => [leaf.path, leaf.value] as const),
  )
  for (const leaf of after) {
    if (leaf.path === path) {
      continue
    }
    if (!beforeValues.has(leaf.path)) {
      return false
    }
    if (beforeValues.get(leaf.path) !== leaf.value) {
      return false
    }
  }
  for (const leaf of before) {
    if (leaf.path !== path && !after.some((item) => item.path === leaf.path)) {
      return false
    }
  }

  const originalLines = new Set(nonEmptyLines(original))
  const originalPrefixes = new Set(
    nonEmptyLines(original)
      .map((line) => matchFieldLinePrefix(field, line))
      .filter((prefix): prefix is string => prefix !== null),
  )
  let offset = 0
  for (const lineText of next.split('\n')) {
    const lineStart = offset
    offset += lineText.length + 1
    const trimmed = lineText.trim()
    if (trimmed.length === 0 || lineStart === target.lineStart) {
      continue
    }
    if (originalLines.has(trimmed)) {
      continue
    }
    const prefix = matchFieldLinePrefix(field, lineText)
    if (prefix !== null && originalPrefixes.has(prefix)) {
      continue
    }
    return false
  }
  return true
}

function withAssumptionValue(
  schema: PromptSchema,
  path: AssumptionPath,
  value: string,
): PromptSchema | null {
  switch (path) {
    case 'output.language':
      return {
        ...schema,
        output: { ...schema.output, language: value },
      }
    case 'output.length':
      return {
        ...schema,
        output: { ...schema.output, length: value },
      }
    case 'output.tone':
      return {
        ...schema,
        output: { ...schema.output, tone: value },
      }
    case 'context.audience':
      return {
        ...schema,
        context: { ...schema.context, audience: value },
      }
    case 'output.format': {
      const format = FORMAT_BY_LABEL.get(value)
      if (format === undefined) {
        return null
      }
      return {
        ...schema,
        output: { ...schema.output, format },
      }
    }
    default: {
      const exhaustive: never = path
      throw new Error(`未知假设路径：${String(exhaustive)}`)
    }
  }
}

/**
 * 字段里没有目标行时的安全补写。
 *
 * 只在原文能被解析再渲染无损覆盖时执行，且补写后再次做内容锚点检查。
 * 原文含游离行时返回 null，由调用方拒绝整次写入并保留原文。
 */
function renderWithAssumption(
  field: FieldKey,
  text: string,
  path: AssumptionPath,
  value: string,
): string | null {
  const audit = auditFieldContent(field, text)
  if (!audit.canonical) {
    return null
  }
  const schema = buildSchemaFromFields({ [field]: text })
  const nextSchema = withAssumptionValue(schema, path, value)
  if (nextSchema === null) {
    return null
  }
  const rendered = renderFieldText(nextSchema, field).trimEnd()
  if (
    rendered.length === 0 ||
    !fallbackIsSafe(field, text, rendered, path, value)
  ) {
    return null
  }
  return rendered
}

/**
 * 把一条假设的新值写到对应字段。返回值只包含目标字段的新文本，
 * 调用方按字段写回文档，其余七个字段不会经过本函数。
 */
export function writeAssumptionValue(
  fields: Partial<Record<FieldKey, string>>,
  path: string,
  value: string,
): AssumptionWrite {
  const definition = definitionOf(path)
  if (definition === null) {
    return {
      ok: false,
      path,
      reason: 'unsupported-path',
      field: null,
      text: '',
    }
  }

  const normalized = normalizeAssumptionValue(definition.path, value)
  const field = definition.targetField
  const text = fields[field] ?? ''
  if (normalized === null) {
    return {
      ok: false,
      path: definition.path,
      reason: 'invalid-value',
      field,
      text,
    }
  }
  if (text.trim().length === 0) {
    return {
      ok: false,
      path: definition.path,
      reason: 'empty-field',
      field,
      text,
    }
  }

  const direct = replaceLeafValue(field, text, definition.path, normalized)
  if (direct.replaced) {
    return {
      ok: true,
      path: definition.path,
      field,
      text: direct.text,
      mode: 'leaf',
    }
  }

  const rendered = renderWithAssumption(
    field,
    text,
    definition.path,
    normalized,
  )
  if (rendered === null) {
    return {
      ok: false,
      path: definition.path,
      reason: 'unsafe-content',
      field,
      text,
    }
  }
  return {
    ok: true,
    path: definition.path,
    field,
    text: rendered,
    mode: 'render',
  }
}

export interface ExportedAssumption {
  readonly path: string
  readonly label: string
  readonly value: string
  /** 导出时可直接写进 Markdown 注释的一行，供工单 12 消费。 */
  readonly comment: string
}

export interface ExportAssumptionOptions {
  /** true 时返回空数组，导出内容里不出现任何假设注释。 */
  readonly omitAssumptions: boolean
}

/**
 * 导出用的假设数据。开关与数据都在这里收口，工单 12 只消费返回值即可。
 */
export function buildExportAssumptions(
  assumptions: readonly Assumption[],
  options: ExportAssumptionOptions,
): ExportedAssumption[] {
  if (options.omitAssumptions) {
    return []
  }
  return assumptions.map((assumption) => ({
    path: assumption.path,
    label: assumption.label,
    value: assumption.value,
    comment: `> 假设：${assumption.label} = ${assumption.value}`,
  }))
}

/** 路径所属字段，便于界面与测试确认一条假设只影响一个字段。 */
export function assumptionFieldOf(path: string): FieldKey | null {
  return definitionOf(path)?.targetField ?? fieldKeyOfPath(path)
}
