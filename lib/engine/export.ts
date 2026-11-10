import type { ExportedAssumption } from './assumptions'
import {
  FIELD_KEYS,
  type FieldKey,
  type PromptSchema,
  type PromptVariable,
} from './schema'
import {
  FORMAT_LABELS,
  TASK_TYPE_LABELS,
  fieldHeading,
  renderFieldText,
} from './render'

/**
 * 导出层纯函数（工单 12）。
 *
 * 只做两件事：把 schema 排成 Markdown，或排成 OpenAI Chat messages 请求体。
 * 两个函数都不读环境、不发请求、不碰 DOM，同一输入永远得到同一输出。
 *
 * 导出转义规则（架构文档「十五、幂等、traceId 与导出转义」）：
 * - 两种格式都保留 `{{var}}`，不做值替换；
 * - 字面量花括号原样保留，只有出现在 `input.variables` 里的名字才算变量；
 * - 宁可报错，也不产出语法非法的字符串。
 *
 * 因此这里在返回前做两道自检：
 * - Markdown：代码围栏必须成对，正文里的 `{{...}}` 必须完整且名字合法；
 * - OpenAI messages：序列化结果再过一次 `JSON.parse`。
 *
 * 假设注释不在本模块里拼：调用方先把 `buildExportAssumptions(assumptions,
 * { omitAssumptions })` 的结果传进来，「剔除」开关只影响那一个入参。
 */

/** 变量名规则与 `schema.ts` 的 Zod 校验保持一致。 */
const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** CommonMark 围栏：最多 3 个空格缩进，至少 3 个反引号或波浪号。 */
const FENCE_PATTERN = /^\s{0,3}(`{3,}|~{3,})(.*)$/

/**
 * 导出的 OpenAI 请求体默认模型。
 * schema 不记录模型，这里给一个能直接被官方 SDK 接受的值，调用方可自行修改。
 */
export const OPENAI_EXPORT_MODEL = 'gpt-4o-mini'

export type ExportFormat = 'markdown' | 'openai-messages'

export interface PromptExportInput {
  readonly schema: PromptSchema
  /** `buildExportAssumptions` 的结果。空数组表示导出时剔除假设注释。 */
  readonly assumptions?: readonly ExportedAssumption[]
}

export interface ExportVariable {
  readonly name: string
  readonly placeholder: string
  readonly label: string
  readonly type: PromptVariable['type']
  readonly required: boolean
  readonly defaultValue?: string
  readonly options?: readonly string[]
  readonly description?: string
}

export type ExportIssueCode =
  | 'invalid-variable-name'
  | 'duplicate-variable-name'
  | 'malformed-placeholder'
  | 'unbalanced-fence'
  | 'unserializable-json'

export interface ExportIssue {
  readonly code: ExportIssueCode
  readonly message: string
  readonly path?: string
}

export type ExportResult =
  | {
      readonly ok: true
      readonly format: ExportFormat
      readonly content: string
      readonly variables: readonly ExportVariable[]
      /** 语法完整但未在 input.variables 声明的占位符，按字面量保留。 */
      readonly literalPlaceholders: readonly string[]
    }
  | {
      readonly ok: false
      readonly format: ExportFormat
      readonly issues: readonly ExportIssue[]
    }

interface ProseLine {
  readonly line: number
  readonly text: string
}

interface MarkdownScan {
  /** 花括号之外的正文行，行号对应完整导出文本。 */
  readonly prose: ProseLine[]
  readonly fenceIssue: ExportIssue | null
}

interface FenceState {
  readonly char: string
  readonly length: number
  readonly line: number
}

function normalizeTitle(schema: PromptSchema): string {
  return schema.meta.title.replace(/\s+/g, ' ').trim() || '未命名提示词'
}

function markdownSummary(schema: PromptSchema): string {
  return [
    `任务类型：${TASK_TYPE_LABELS[schema.meta.taskType]}`,
    `输出格式：${FORMAT_LABELS[schema.output.format]}`,
    `变量：${schema.input.variables.length} 个`,
  ].join(' · ')
}

/** 与 render.ts 的文档结构一致：`## n. 字段名` 加字段正文。 */
function fieldSection(schema: PromptSchema, field: FieldKey): string {
  const body = renderFieldText(schema, field).trim()
  if (body.length === 0) {
    return ''
  }
  return `## ${fieldHeading(field)}\n\n${body}`
}

/**
 * 假设注释按行拼成 blockquote。模型给出的假设值可能含换行，
 * 行内压平可以避免把后面的正文顶出引用块。
 */
function assumptionSection(
  assumptions: readonly ExportedAssumption[],
): string {
  if (assumptions.length === 0) {
    return ''
  }
  const comments = assumptions.map((item) =>
    item.comment.replace(/\r?\n/g, ' ').trim(),
  )
  return `## 生成假设\n\n${comments.join('\n')}`
}

function joinParts(parts: readonly string[]): string {
  return `${parts
    .filter((part) => part.length > 0)
    .join('\n\n')
    .trimEnd()}\n`
}

function buildMarkdownContent(
  schema: PromptSchema,
  assumptions: readonly ExportedAssumption[],
): string {
  const parts: string[] = [
    `# ${normalizeTitle(schema)}`,
    `> ${markdownSummary(schema)}`,
  ]
  for (const field of FIELD_KEYS) {
    parts.push(fieldSection(schema, field))
  }
  parts.push(assumptionSection(assumptions))
  return joinParts(parts)
}

/** 系统消息承载规则，用户消息承载上下文与变量位。 */
const SYSTEM_FIELDS: readonly FieldKey[] = [
  'role',
  'objective',
  'constraints',
  'output',
  'examples',
  'selfCheck',
]

const USER_FIELDS: readonly FieldKey[] = ['context', 'input']

function buildSystemContent(
  schema: PromptSchema,
  assumptions: readonly ExportedAssumption[],
): string {
  const parts: string[] = [
    `# ${normalizeTitle(schema)}`,
    `> ${markdownSummary(schema)}`,
  ]
  for (const field of SYSTEM_FIELDS) {
    parts.push(fieldSection(schema, field))
  }
  parts.push(assumptionSection(assumptions))
  return parts
    .filter((part) => part.length > 0)
    .join('\n\n')
    .trimEnd()
}

function buildUserContent(schema: PromptSchema): string {
  const parts: string[] = []
  for (const field of USER_FIELDS) {
    parts.push(fieldSection(schema, field))
  }
  return parts
    .filter((part) => part.length > 0)
    .join('\n\n')
    .trimEnd()
}

function variableIssues(
  variables: readonly PromptVariable[],
): ExportIssue[] {
  const issues: ExportIssue[] = []
  const seen = new Map<string, number>()

  variables.forEach((variable, index) => {
    const path = `input.variables[${index}].name`
    if (!VARIABLE_NAME_PATTERN.test(variable.name)) {
      issues.push({
        code: 'invalid-variable-name',
        path,
        message: `变量名「${variable.name}」不合法：只能包含字母、数字与下划线，且不能以数字开头。`,
      })
      return
    }
    const previous = seen.get(variable.name)
    if (previous !== undefined) {
      issues.push({
        code: 'duplicate-variable-name',
        path,
        message: `变量名「${variable.name}」重复（与第 ${previous + 1} 个变量同名），导出后无法确定替换哪一个。`,
      })
      return
    }
    seen.set(variable.name, index)
  })

  return issues
}

function buildExportVariables(
  variables: readonly PromptVariable[],
): ExportVariable[] {
  return variables.map((variable) => ({
    name: variable.name,
    placeholder: `{{${variable.name}}}`,
    label: variable.label,
    type: variable.type,
    required: variable.required,
    ...(variable.defaultValue !== undefined
      ? { defaultValue: variable.defaultValue }
      : {}),
    ...(variable.options !== undefined
      ? { options: [...variable.options] }
      : {}),
    ...(variable.description !== undefined
      ? { description: variable.description }
      : {}),
  }))
}

function findBacktickRun(
  line: string,
  from: number,
  length: number,
): number {
  let index = from
  while (index < line.length) {
    if (line[index] !== '`') {
      index += 1
      continue
    }
    let run = 0
    while (line[index + run] === '`') {
      run += 1
    }
    if (run === length) {
      return index
    }
    index += run
  }
  return -1
}

/**
 * 把行内代码替换成等长空格。
 * 行内代码里的 `{{x}` 是字面量，不参与占位符完整性校验。
 */
function maskInlineCode(line: string): string {
  let output = ''
  let index = 0
  while (index < line.length) {
    if (line[index] !== '`') {
      output += line[index]
      index += 1
      continue
    }
    let run = 0
    while (line[index + run] === '`') {
      run += 1
    }
    const close = findBacktickRun(line, index + run, run)
    if (close === -1) {
      output += ' '.repeat(run)
      index += run
      continue
    }
    output += ' '.repeat(close + run - index)
    index = close + run
  }
  return output
}

/**
 * 单次扫描 Markdown：拆出正文行，同时记录未闭合的代码围栏。
 * 围栏内的内容按字面量处理，不扫描变量占位符。
 */
function scanMarkdown(text: string): MarkdownScan {
  const prose: ProseLine[] = []
  let fence: FenceState | null = null
  const lines = text.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const match = FENCE_PATTERN.exec(raw)
    const marker = match?.[1] ?? ''
    const info = match?.[2] ?? ''
    const char = marker.charAt(0)

    if (fence === null) {
      // CommonMark 规定反引号围栏的信息串里不能再出现反引号。
      if (match !== null && !(char === '`' && info.includes('`'))) {
        fence = { char, length: marker.length, line: index + 1 }
        continue
      }
      prose.push({ line: index + 1, text: maskInlineCode(raw) })
      continue
    }

    if (
      match !== null &&
      char === fence.char &&
      marker.length >= fence.length &&
      info.trim().length === 0
    ) {
      fence = null
    }
  }

  if (fence === null) {
    return { prose, fenceIssue: null }
  }
  return {
    prose,
    fenceIssue: {
      code: 'unbalanced-fence',
      message: `第 ${fence.line} 行开始的代码围栏没有闭合，导出后 Markdown 结构会错乱。请补上闭合围栏或去掉围栏。`,
    },
  }
}

interface PlaceholderScan {
  readonly names: readonly string[]
  readonly issue: ExportIssue | null
}

/** 校验 `{{...}}` 完整且名字合法；`${x}`、`{}` 不参与。 */
function scanPlaceholders(prose: readonly ProseLine[]): PlaceholderScan {
  const names: string[] = []

  for (const entry of prose) {
    let cursor = 0
    while (cursor < entry.text.length) {
      const start = entry.text.indexOf('{{', cursor)
      if (start === -1) {
        break
      }
      const close = entry.text.indexOf('}}', start + 2)
      if (close === -1) {
        return {
          names,
          issue: {
            code: 'malformed-placeholder',
            message: `第 ${entry.line} 行的「{{」没有配对的「}}」，导出会产出不完整的占位符。`,
          },
        }
      }
      const name = entry.text.slice(start + 2, close)
      if (!VARIABLE_NAME_PATTERN.test(name)) {
        return {
          names,
          issue: {
            code: 'malformed-placeholder',
            message: `第 ${entry.line} 行的占位符「{{${name}}}」不合法：花括号内只能包含字母、数字与下划线，且不能以数字开头。`,
          },
        }
      }
      names.push(name)
      cursor = close + 2
    }
  }

  return { names, issue: null }
}

function uniqueUndeclared(
  names: readonly string[],
  declared: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const name of names) {
    if (declared.has(name) || seen.has(name)) {
      continue
    }
    seen.add(name)
    output.push(name)
  }
  return output
}

function declaredNames(variables: readonly PromptVariable[]): Set<string> {
  return new Set(variables.map((variable) => variable.name))
}

/** Markdown 导出：结构可读，`{{var}}` 原样保留。 */
export function buildMarkdownExport(
  input: PromptExportInput,
): ExportResult {
  const issues = variableIssues(input.schema.input.variables)
  const content = buildMarkdownContent(
    input.schema,
    input.assumptions ?? [],
  )
  const scan = scanMarkdown(content)
  const placeholders = scanPlaceholders(scan.prose)

  if (scan.fenceIssue !== null) {
    issues.push(scan.fenceIssue)
  }
  if (placeholders.issue !== null) {
    issues.push(placeholders.issue)
  }
  if (issues.length > 0) {
    return { ok: false, format: 'markdown', issues }
  }

  return {
    ok: true,
    format: 'markdown',
    content,
    variables: buildExportVariables(input.schema.input.variables),
    literalPlaceholders: uniqueUndeclared(
      placeholders.names,
      declaredNames(input.schema.input.variables),
    ),
  }
}

interface OpenAIMessage {
  readonly role: 'system' | 'user'
  readonly content: string
}

interface OpenAIMessagesPayload {
  readonly model: string
  readonly messages: readonly OpenAIMessage[]
  readonly variables: readonly ExportVariable[]
}

/**
 * OpenAI Chat messages 导出。
 *
 * 输出是 `{ model, messages, variables }`：`messages` 可直接交给官方 SDK，
 * `variables` 是变量清单（调用方替换 `{{name}}` 时用），不参与请求。
 */
export function buildOpenAIMessagesExport(
  input: PromptExportInput,
): ExportResult {
  const issues = variableIssues(input.schema.input.variables)
  const system = buildSystemContent(
    input.schema,
    input.assumptions ?? [],
  )
  const user = buildUserContent(input.schema)
  const combined = `${system}\n\n${user}`
  const placeholders = scanPlaceholders(scanMarkdown(combined).prose)

  if (placeholders.issue !== null) {
    issues.push(placeholders.issue)
  }
  if (issues.length > 0) {
    return { ok: false, format: 'openai-messages', issues }
  }

  const variables = buildExportVariables(input.schema.input.variables)
  const payload: OpenAIMessagesPayload = {
    model: OPENAI_EXPORT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    variables,
  }

  let content: string
  try {
    content = `${JSON.stringify(payload, null, 2)}\n`
    JSON.parse(content)
  } catch {
    return {
      ok: false,
      format: 'openai-messages',
      issues: [
        {
          code: 'unserializable-json',
          message:
            '导出内容无法序列化为合法 JSON，可能是字段里含有无法表示的值。请检查字段内容后重试。',
        },
      ],
    }
  }

  return {
    ok: true,
    format: 'openai-messages',
    content,
    variables,
    literalPlaceholders: uniqueUndeclared(
      placeholders.names,
      declaredNames(input.schema.input.variables),
    ),
  }
}

/** 供界面判断能否复制，避免在两个组件里重复写 `result.ok`。 */
export function exportContentOf(result: ExportResult): string | null {
  return result.ok ? result.content : null
}
