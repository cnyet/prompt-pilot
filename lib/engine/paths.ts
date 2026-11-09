import {
  type Assumption,
  type FieldKey,
  type OutputFormat,
  type PromptSchema,
  type PromptVariable,
  type TaskType,
} from './schema'
import { FORMAT_LABELS, VARIABLE_TYPE_LABELS } from './render'

/**
 * 字段文本与结构化路径的双向映射。
 *
 * 工单 02 的文档值只有「字段文本」，没有叶子路径；假设 chip（工单 04）要按
 * `output.language`、`constraints.must[0]` 这类路径定位并改写单个叶子，就
 * 必须先有一层可逆映射。
 *
 * 本模块是纯函数：输入字段文本，输出叶子列表（路径、值、字符区间、行区间）。
 * 渲染层 `renderFieldSegments` 定义文本格式，这里实现它的逆运算。因为两边的
 * 格式由同一份渲染器约定，`renderFieldText` 再 `parseField` 可以无损往返。
 *
 * 路径语法：
 * - 对象字段用点号：`output.language`
 * - 数组用方括号：`constraints.must[0]`、`examples.items[0].input`
 * - 兼容渲染层的点号下标：`constraints.must.0` 会归一化为 `constraints.must[0]`
 */

export type LeafKind = 'scalar' | 'list-item'

/**
 * 假设 chip（工单 04）会命中的路径。全部已由本模块覆盖，可直接按叶子改写：
 * 读值用 `readLeafValue`，写值用 `replaceLeafValue`，改完再重建 schema 校验。
 */
export const SUPPORTED_ASSUMPTION_PATHS = [
  'output.language',
  'output.length',
  'output.format',
  'context.audience',
  'output.tone',
] as const

export interface FieldLeaf {
  field: FieldKey
  /** 归一化后的叶子路径，如 `constraints.must[0]`。 */
  path: string
  /** 叶子当前值。列表项不含前导的 `- `。 */
  value: string
  /** 值在字段文本中的起始偏移（UTF-16 码元，与 textarea 一致）。 */
  start: number
  /** 值在字段文本中的结束偏移，区间为 [start, end)。 */
  end: number
  /** 所在行的起始偏移，用于整行删除。 */
  lineStart: number
  /** 所在行的结束偏移，不含换行符。 */
  lineEnd: number
  kind: LeafKind
  /** 人类可读的展示名，如「输出语言」「必须」。 */
  label: string
}

export interface ParsedField<K extends FieldKey = FieldKey> {
  leaves: FieldLeaf[]
  value: PromptSchema[K]
}

export interface FieldSchemaMeta {
  title?: string
  taskType?: TaskType
  language?: 'zh' | 'en' | 'auto'
  mode?: 'generate' | 'improve'
  templateId?: string
  assumptions?: Assumption[]
}

interface TextLine {
  start: number
  end: number
  text: string
}

interface ListBlock {
  leaves: FieldLeaf[]
  items: string[]
  /** 最后一个被消费的行下标；调用方从 endIndex + 1 继续扫描。 */
  endIndex: number
}

const EMPTY_LIST_MARKERS = ['无', '无特别要求', '暂无'] as const

const KNOWN_LIST_PARENTS = new Set([
  'successCriteria',
  'nonGoals',
  'knownFacts',
  'variables',
  'must',
  'mustNot',
  'scopeIn',
  'scopeOut',
  'priority',
  'sections',
  'items',
  'negative',
  'checklist',
])

const ROLE_PREFIXES = ['你是谁：', '专长：', '视角：'] as const
const OBJECTIVE_PREFIXES = ['目标：', '成功标准：', '不追求：'] as const
const CONTEXT_PREFIXES = ['背景：', '受众：', '已知事实：', '缺少输入时：'] as const
const CONSTRAINT_PREFIXES = [
  '必须：',
  '禁止：',
  '范围内：',
  '明确不做：',
  '知识不足时：',
  '输入有歧义时：',
  '格式边界：',
  '安全边界：',
  '冲突时的优先级：',
] as const
const OUTPUT_PREFIXES = ['格式：', '结构：', '章节：', '长度：', '语言：', '语气：'] as const
const SELF_CHECK_PREFIXES = ['自检清单：', '自检不通过时：'] as const

function splitLines(text: string): TextLine[] {
  const lines: TextLine[] = []
  let start = 0
  while (start <= text.length) {
    const newline = text.indexOf('\n', start)
    const end = newline === -1 ? text.length : newline
    lines.push({ start, end, text: text.slice(start, end) })
    if (newline === -1) {
      break
    }
    start = newline + 1
  }
  return lines
}

function makeLeaf(
  text: string,
  field: FieldKey,
  line: TextLine,
  path: string,
  start: number,
  end: number,
  kind: LeafKind,
  label: string,
): FieldLeaf {
  // 标量可能延伸到文件末尾的空行；把尾随换行留在叶子外面，
  // 否则「加长」会把补充句追加到换行之后，产生一行悬空文本。
  let valueEnd = end
  while (valueEnd > start && text.charAt(valueEnd - 1) === '\n') {
    valueEnd -= 1
  }
  return {
    field,
    path,
    value: text.slice(start, valueEnd),
    start,
    end: valueEnd,
    lineStart: line.start,
    lineEnd: line.end,
    kind,
    label,
  }
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0
}

function optionalText(value: string | undefined): string | undefined {
  return isBlank(value) ? undefined : value
}

/**
 * 标量值可以跨行（例如 context.background 的渲染结果含换行）。
 * 向后延伸到下一个已知标签行为止，保证多行文本也能无损往返。
 */
function extendScalarEnd(
  lines: TextLine[],
  lineIndex: number,
  prefixes: readonly string[],
): number {
  const first = lines[lineIndex]
  if (!first) {
    return 0
  }
  let end = first.end
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      break
    }
    if (prefixes.some((prefix) => line.text.startsWith(prefix))) {
      break
    }
    end = line.end
  }
  return end
}

function reverseLabel<T extends string>(
  labels: Record<T, string>,
  display: string,
): T | null {
  for (const key of Object.keys(labels) as T[]) {
    if (labels[key] === display.trim()) {
      return key
    }
  }
  return null
}

/** 点号下标归一化为方括号下标：`constraints.must.0` -> `constraints.must[0]`。 */
export function normalizeLeafPath(path: string): string {
  const parts = path.split('.')
  const output: string[] = []
  for (const part of parts) {
    const previous = output.length - 1
    const previousPart = output[previous]
    if (
      /^\d+$/.test(part) &&
      previousPart !== undefined &&
      KNOWN_LIST_PARENTS.has(previousPart.replace(/\[\d+\]$/u, ''))
    ) {
      output[previous] = `${previousPart}[${part}]`
      continue
    }
    output.push(part)
  }
  return output.join('.')
}

/** 路径所属的八字段之一。无法识别时返回 null。 */
export function fieldKeyOfPath(path: string): FieldKey | null {
  const head = path.split(/[.[]/u)[0]
  if (head === undefined) {
    return null
  }
  const field = head as FieldKey
  const known: readonly string[] = [
    'role',
    'objective',
    'context',
    'input',
    'constraints',
    'output',
    'examples',
    'selfCheck',
  ]
  return known.includes(field) ? field : null
}

function parseListBlock(
  text: string,
  lines: TextLine[],
  headerIndex: number,
  field: FieldKey,
  header: string,
  collectionPath: string,
  label: string,
  emptyMarkers: readonly string[] = EMPTY_LIST_MARKERS,
): ListBlock {
  const headerLine = lines[headerIndex]
  if (!headerLine) {
    return { leaves: [], items: [], endIndex: headerIndex }
  }

  const leaves: FieldLeaf[] = []
  const items: string[] = []
  const suffix = headerLine.text.slice(header.length)
  const trimmedSuffix = suffix.trim()

  if (trimmedSuffix.length > 0) {
    // 空列表渲染为 `必须：无`；若用户把「无」替换成正文，就当作第 0 项。
    if (emptyMarkers.includes(trimmedSuffix)) {
      return { leaves, items, endIndex: headerIndex }
    }
    const leading = suffix.length - suffix.trimStart().length
    const start = headerLine.start + header.length + leading
    const leaf = makeLeaf(
      text,
      field,
      headerLine,
      `${collectionPath}[0]`,
      start,
      headerLine.end,
      'list-item',
      label,
    )
    leaves.push(leaf)
    items.push(leaf.value)
    return { leaves, items, endIndex: headerIndex }
  }

  let cursor = headerIndex + 1
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (!line || !line.text.startsWith('- ')) {
      break
    }
    const index = items.length
    const leaf = makeLeaf(
      text,
      field,
      line,
      `${collectionPath}[${index}]`,
      line.start + 2,
      line.end,
      'list-item',
      label,
    )
    leaves.push(leaf)
    items.push(leaf.value)
    cursor += 1
  }

  return { leaves, items, endIndex: cursor - 1 }
}

/* ------------------------------------------------------------------ */
/* 每个字段的解析                                                       */
/* ------------------------------------------------------------------ */

function parseRole(text: string): ParsedField<'role'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let persona = ''
  let expertise: string | undefined
  let stance: string | undefined

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (line.text.startsWith('你是谁：')) {
      const leaf = makeLeaf(
        text,
        'role',
        line,
        'role.persona',
        line.start + 4,
        extendScalarEnd(lines, index, ROLE_PREFIXES),
        'scalar',
        '身份',
      )
      leaves.push(leaf)
      persona = leaf.value
      continue
    }
    if (line.text.startsWith('专长：')) {
      const leaf = makeLeaf(
        text,
        'role',
        line,
        'role.expertise',
        line.start + 3,
        extendScalarEnd(lines, index, ROLE_PREFIXES),
        'scalar',
        '专长',
      )
      leaves.push(leaf)
      expertise = optionalText(leaf.value)
      continue
    }
    if (line.text.startsWith('视角：')) {
      const leaf = makeLeaf(
        text,
        'role',
        line,
        'role.stance',
        line.start + 3,
        extendScalarEnd(lines, index, ROLE_PREFIXES),
        'scalar',
        '视角',
      )
      leaves.push(leaf)
      stance = optionalText(leaf.value)
    }
  }

  return { leaves, value: { persona, expertise, stance } }
}
function parseObjective(text: string): ParsedField<'objective'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let goal = ''
  let successCriteria: string[] = []
  let nonGoals: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (line.text.startsWith('目标：')) {
      const leaf = makeLeaf(
        text,
        'objective',
        line,
        'objective.goal',
        line.start + 3,
        extendScalarEnd(lines, index, OBJECTIVE_PREFIXES),
        'scalar',
        '目标',
      )
      leaves.push(leaf)
      goal = leaf.value
      continue
    }
    if (line.text.startsWith('成功标准：')) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'objective',
        '成功标准：',
        'objective.successCriteria',
        '成功标准',
      )
      leaves.push(...block.leaves)
      successCriteria = block.items
      index = block.endIndex
      continue
    }
    if (line.text.startsWith('不追求：')) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'objective',
        '不追求：',
        'objective.nonGoals',
        '不追求',
      )
      leaves.push(...block.leaves)
      nonGoals = block.items
      index = block.endIndex
    }
  }

  return { leaves, value: { goal, successCriteria, nonGoals } }
}

function parseContext(text: string): ParsedField<'context'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let background = ''
  let audience: string | undefined
  let knownFacts: string[] = []
  let missingInputPolicy: string | undefined

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (line.text.startsWith('背景：')) {
      const leaf = makeLeaf(
        text,
        'context',
        line,
        'context.background',
        line.start + 3,
        extendScalarEnd(lines, index, CONTEXT_PREFIXES),
        'scalar',
        '背景',
      )
      leaves.push(leaf)
      background = leaf.value
      continue
    }
    if (line.text.startsWith('受众：')) {
      const leaf = makeLeaf(
        text,
        'context',
        line,
        'context.audience',
        line.start + 3,
        extendScalarEnd(lines, index, CONTEXT_PREFIXES),
        'scalar',
        '受众',
      )
      leaves.push(leaf)
      audience = optionalText(leaf.value)
      continue
    }
    if (line.text.startsWith('已知事实：')) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'context',
        '已知事实：',
        'context.knownFacts',
        '已知事实',
      )
      leaves.push(...block.leaves)
      knownFacts = block.items
      index = block.endIndex
      continue
    }
    if (line.text.startsWith('缺少输入时：')) {
      const leaf = makeLeaf(
        text,
        'context',
        line,
        'context.missingInputPolicy',
        line.start + 6,
        extendScalarEnd(lines, index, CONTEXT_PREFIXES),
        'scalar',
        '缺少输入时',
      )
      leaves.push(leaf)
      missingInputPolicy = optionalText(leaf.value)
    }
  }

  return {
    leaves,
    value: { background, audience, knownFacts, missingInputPolicy },
  }
}

function parseVariableLine(
  text: string,
  line: TextLine,
  index: number,
): { leaves: FieldLeaf[]; variable: PromptVariable | null } {
  const prefix = '- {{'
  if (!line.text.startsWith(prefix)) {
    return { leaves: [], variable: null }
  }
  const close = line.text.indexOf('}}：', prefix.length)
  if (close === -1) {
    return { leaves: [], variable: null }
  }

  const nameStart = line.start + prefix.length
  const nameEnd = line.start + close
  const name = line.text.slice(prefix.length, close)
  const afterClose = close + 3
  const rest = line.text.slice(afterClose)

  let labelEnd = rest.length
  let flags: string | null = null
  if (rest.endsWith('）')) {
    const open = rest.lastIndexOf('（')
    if (open !== -1) {
      labelEnd = open
      flags = rest.slice(open + 1, -1)
    }
  }

  const labelStart = line.start + afterClose
  const label = rest.slice(0, labelEnd)
  if (name.length === 0 || label.length === 0) {
    return { leaves: [], variable: null }
  }

  const leaves: FieldLeaf[] = [
    makeLeaf(
      text,
      'input',
      line,
      `input.variables[${index}].name`,
      nameStart,
      nameEnd,
      'scalar',
      '变量名',
    ),
    makeLeaf(
      text,
      'input',
      line,
      `input.variables[${index}].label`,
      labelStart,
      labelStart + labelEnd,
      'scalar',
      '变量标签',
    ),
  ]

  const variable: PromptVariable = {
    name,
    label,
    type: 'text',
    required: true,
  }

  if (flags !== null) {
    const flagsStart = labelStart + labelEnd + 1
    let cursor = 0
    while (cursor <= flags.length) {
      const comma = flags.indexOf('，', cursor)
      const partEnd = comma === -1 ? flags.length : comma
      const part = flags.slice(cursor, partEnd)
      const partStart = flagsStart + cursor
      if (part.startsWith('默认值：')) {
        const valueStart = partStart + 4
        leaves.push(
          makeLeaf(
            text,
            'input',
            line,
            `input.variables[${index}].defaultValue`,
            valueStart,
            flagsStart + partEnd,
            'scalar',
            '默认值',
          ),
        )
        variable.defaultValue = part.slice(4)
      } else if (part.startsWith('可选值：')) {
        const valueStart = partStart + 4
        const raw = part.slice(4)
        leaves.push(
          makeLeaf(
            text,
            'input',
            line,
            `input.variables[${index}].options`,
            valueStart,
            flagsStart + partEnd,
            'scalar',
            '可选值',
          ),
        )
        variable.options = raw
          .split(' / ')
          .map((option) => option.trim())
          .filter(Boolean)
      } else if (part === '必填' || part === '可选') {
        leaves.push(
          makeLeaf(
            text,
            'input',
            line,
            `input.variables[${index}].required`,
            partStart,
            flagsStart + partEnd,
            'scalar',
            '是否必填',
          ),
        )
        variable.required = part === '必填'
      } else {
        const type = reverseLabel(VARIABLE_TYPE_LABELS, part)
        if (type !== null) {
          leaves.push(
            makeLeaf(
              text,
              'input',
              line,
              `input.variables[${index}].type`,
              partStart,
              flagsStart + partEnd,
              'scalar',
              '变量类型',
            ),
          )
          variable.type = type
        } else if (part.length > 0) {
          leaves.push(
            makeLeaf(
              text,
              'input',
              line,
              `input.variables[${index}].description`,
              partStart,
              flagsStart + partEnd,
              'scalar',
              '变量说明',
            ),
          )
          variable.description = part
        }
      }
      if (comma === -1) {
        break
      }
      cursor = comma + 1
    }
  }

  return { leaves, variable }
}

function parseInput(text: string): ParsedField<'input'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  const variables: PromptVariable[] = []

  const headerIndex = lines.findIndex((line) =>
    line.text.startsWith('变量：'),
  )
  if (headerIndex === -1) {
    return { leaves, value: { variables } }
  }

  const header = lines[headerIndex]
  if (!header) {
    return { leaves, value: { variables } }
  }
  const suffix = header.text.slice(3).trim()
  // 空变量渲染为固定句式；用户把它改成正文时不强行解析成变量。
  if (suffix.length > 0) {
    return { leaves, value: { variables } }
  }

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || !line.text.startsWith('- ')) {
      break
    }
    const parsed = parseVariableLine(text, line, variables.length)
    if (parsed.variable) {
      variables.push(parsed.variable)
      leaves.push(...parsed.leaves)
    }
  }

  return { leaves, value: { variables } }
}

function parseConstraints(text: string): ParsedField<'constraints'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let must: string[] = []
  let mustNot: string[] = []
  let scopeIn: string[] = []
  let scopeOut: string[] = []
  let knowledgePolicy = ''
  let ambiguityPolicy = ''
  let formatBoundary: string | undefined
  let safetyBoundary: string | undefined
  let priority: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    const listHeaders: readonly {
      header: string
      path: string
      label: string
      apply: (items: string[]) => void
    }[] = [
      {
        header: '必须：',
        path: 'constraints.must',
        label: '必须',
        apply: (items) => {
          must = items
        },
      },
      {
        header: '禁止：',
        path: 'constraints.mustNot',
        label: '禁止',
        apply: (items) => {
          mustNot = items
        },
      },
      {
        header: '范围内：',
        path: 'constraints.boundaries.scopeIn',
        label: '范围内',
        apply: (items) => {
          scopeIn = items
        },
      },
      {
        header: '明确不做：',
        path: 'constraints.boundaries.scopeOut',
        label: '明确不做',
        apply: (items) => {
          scopeOut = items
        },
      },
      {
        header: '冲突时的优先级：',
        path: 'constraints.priority',
        label: '优先级',
        apply: (items) => {
          priority = items
        },
      },
    ]

    const listHeader = listHeaders.find((candidate) =>
      line.text.startsWith(candidate.header),
    )
    if (listHeader) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'constraints',
        listHeader.header,
        listHeader.path,
        listHeader.label,
      )
      leaves.push(...block.leaves)
      listHeader.apply(block.items)
      index = block.endIndex
      continue
    }

    const scalarHeaders: readonly {
      header: string
      path: string
      label: string
      apply: (value: string) => void
    }[] = [
      {
        header: '知识不足时：',
        path: 'constraints.boundaries.knowledgePolicy',
        label: '知识不足时',
        apply: (value) => {
          knowledgePolicy = value
        },
      },
      {
        header: '输入有歧义时：',
        path: 'constraints.boundaries.ambiguityPolicy',
        label: '输入有歧义时',
        apply: (value) => {
          ambiguityPolicy = value
        },
      },
      {
        header: '格式边界：',
        path: 'constraints.boundaries.formatBoundary',
        label: '格式边界',
        apply: (value) => {
          formatBoundary = optionalText(value)
        },
      },
      {
        header: '安全边界：',
        path: 'constraints.boundaries.safetyBoundary',
        label: '安全边界',
        apply: (value) => {
          safetyBoundary = optionalText(value)
        },
      },
    ]

    const scalarHeader = scalarHeaders.find((candidate) =>
      line.text.startsWith(candidate.header),
    )
    if (scalarHeader) {
      const leaf = makeLeaf(
        text,
        'constraints',
        line,
        scalarHeader.path,
        line.start + scalarHeader.header.length,
        extendScalarEnd(lines, index, CONSTRAINT_PREFIXES),
        'scalar',
        scalarHeader.label,
      )
      leaves.push(leaf)
      scalarHeader.apply(leaf.value)
    }
  }

  return {
    leaves,
    value: {
      must,
      mustNot,
      boundaries: {
        scopeIn,
        scopeOut,
        knowledgePolicy,
        ambiguityPolicy,
        formatBoundary,
        safetyBoundary,
      },
      priority,
    },
  }
}

function parseOutput(text: string): ParsedField<'output'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let format: OutputFormat = 'markdown'
  let schema: string | undefined
  let sections: string[] = []
  let length: string | undefined
  let language: string | undefined
  let tone: string | undefined

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (line.text.startsWith('格式：')) {
      const leaf = makeLeaf(
        text,
        'output',
        line,
        'output.format',
        line.start + 3,
        extendScalarEnd(lines, index, OUTPUT_PREFIXES),
        'scalar',
        '输出格式',
      )
      leaves.push(leaf)
      format = reverseLabel(FORMAT_LABELS, leaf.value) ?? 'markdown'
      continue
    }
    if (line.text.startsWith('结构：')) {
      const leaf = makeLeaf(
        text,
        'output',
        line,
        'output.schema',
        line.start + 3,
        extendScalarEnd(lines, index, OUTPUT_PREFIXES),
        'scalar',
        '结构说明',
      )
      leaves.push(leaf)
      schema = optionalText(leaf.value)
      continue
    }
    if (line.text.startsWith('章节：')) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'output',
        '章节：',
        'output.sections',
        '章节',
      )
      leaves.push(...block.leaves)
      sections = block.items
      index = block.endIndex
      continue
    }
    if (line.text.startsWith('长度：')) {
      const leaf = makeLeaf(
        text,
        'output',
        line,
        'output.length',
        line.start + 3,
        extendScalarEnd(lines, index, OUTPUT_PREFIXES),
        'scalar',
        '长度',
      )
      leaves.push(leaf)
      length = optionalText(leaf.value)
      continue
    }
    if (line.text.startsWith('语言：')) {
      const leaf = makeLeaf(
        text,
        'output',
        line,
        'output.language',
        line.start + 3,
        extendScalarEnd(lines, index, OUTPUT_PREFIXES),
        'scalar',
        '输出语言',
      )
      leaves.push(leaf)
      language = optionalText(leaf.value)
      continue
    }
    if (line.text.startsWith('语气：')) {
      const leaf = makeLeaf(
        text,
        'output',
        line,
        'output.tone',
        line.start + 3,
        extendScalarEnd(lines, index, OUTPUT_PREFIXES),
        'scalar',
        '语气',
      )
      leaves.push(leaf)
      tone = optionalText(leaf.value)
    }
  }

  return {
    leaves,
    value: { format, schema, sections, length, language, tone },
  }
}

interface ExampleItemDraft {
  input: string
  output: string
  note?: string
}

interface NegativeExampleDraft {
  input: string
  badOutput: string
  why: string
}

function parseExamples(text: string): ParsedField<'examples'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  const items: ExampleItemDraft[] = []
  const negative: NegativeExampleDraft[] = []

  type Mode = 'none' | 'positive' | 'negative'
  let mode: Mode = 'none'

  for (const line of lines) {
    if (line.text.startsWith('正例：')) {
      mode = 'positive'
      continue
    }
    if (line.text.startsWith('反例：')) {
      mode = 'negative'
      continue
    }

    if (mode === 'positive') {
      if (line.text.startsWith('- 输入：')) {
        items.push({ input: '', output: '' })
        const item = items[items.length - 1]
        if (!item) {
          continue
        }
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.items[${items.length - 1}].input`,
          line.start + 5,
          line.end,
          'scalar',
          '正例输入',
        )
        leaves.push(leaf)
        item.input = leaf.value
        continue
      }
      const current = items[items.length - 1]
      if (current && line.text.startsWith('  输出：')) {
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.items[${items.length - 1}].output`,
          line.start + 5,
          line.end,
          'scalar',
          '正例输出',
        )
        leaves.push(leaf)
        current.output = leaf.value
        continue
      }
      if (current && line.text.startsWith('  说明：')) {
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.items[${items.length - 1}].note`,
          line.start + 5,
          line.end,
          'scalar',
          '正例说明',
        )
        leaves.push(leaf)
        current.note = leaf.value
      }
      continue
    }

    if (mode === 'negative') {
      if (line.text.startsWith('- 输入：')) {
        negative.push({ input: '', badOutput: '', why: '' })
        const item = negative[negative.length - 1]
        if (!item) {
          continue
        }
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.negative[${negative.length - 1}].input`,
          line.start + 5,
          line.end,
          'scalar',
          '反例输入',
        )
        leaves.push(leaf)
        item.input = leaf.value
        continue
      }
      const current = negative[negative.length - 1]
      if (current && line.text.startsWith('  不期望输出：')) {
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.negative[${negative.length - 1}].badOutput`,
          line.start + 8,
          line.end,
          'scalar',
          '不期望输出',
        )
        leaves.push(leaf)
        current.badOutput = leaf.value
        continue
      }
      if (current && line.text.startsWith('  原因：')) {
        const leaf = makeLeaf(
          text,
          'examples',
          line,
          `examples.negative[${negative.length - 1}].why`,
          line.start + 5,
          line.end,
          'scalar',
          '反例原因',
        )
        leaves.push(leaf)
        current.why = leaf.value
      }
    }
  }

  return {
    leaves,
    value: { items, negative },
  }
}

function parseSelfCheck(text: string): ParsedField<'selfCheck'> {
  const lines = splitLines(text)
  const leaves: FieldLeaf[] = []
  let checklist: string[] = []
  let onFail: string | undefined

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (line.text.startsWith('自检清单：')) {
      const block = parseListBlock(
        text,
        lines,
        index,
        'selfCheck',
        '自检清单：',
        'selfCheck.checklist',
        '自检清单',
      )
      leaves.push(...block.leaves)
      checklist = block.items
      index = block.endIndex
      continue
    }
    if (line.text.startsWith('自检不通过时：')) {
      const leaf = makeLeaf(
        text,
        'selfCheck',
        line,
        'selfCheck.onFail',
        line.start + 7,
        extendScalarEnd(lines, index, SELF_CHECK_PREFIXES),
        'scalar',
        '自检不通过时',
      )
      leaves.push(leaf)
      onFail = optionalText(leaf.value)
    }
  }

  return { leaves, value: { checklist, onFail } }
}

/* ------------------------------------------------------------------ */
/* 对外接口                                                             */
/* ------------------------------------------------------------------ */

/** 解析一个字段文本，返回叶子列表与结构化的字段值。 */
export function parseField<K extends FieldKey>(
  field: K,
  text: string,
): ParsedField<K> {
  switch (field) {
    case 'role':
      return parseRole(text) as ParsedField<K>
    case 'objective':
      return parseObjective(text) as ParsedField<K>
    case 'context':
      return parseContext(text) as ParsedField<K>
    case 'input':
      return parseInput(text) as ParsedField<K>
    case 'constraints':
      return parseConstraints(text) as ParsedField<K>
    case 'output':
      return parseOutput(text) as ParsedField<K>
    case 'examples':
      return parseExamples(text) as ParsedField<K>
    case 'selfCheck':
      return parseSelfCheck(text) as ParsedField<K>
    default: {
      const exhaustive: never = field
      throw new Error(`未知字段：${String(exhaustive)}`)
    }
  }
}

/** 只取叶子列表，供补丁与测试使用。 */
export function extractLeaves(field: FieldKey, text: string): FieldLeaf[] {
  return parseField(field, text).leaves
}

/** 找到指定路径的叶子。路径会先归一化。 */
export function findLeaf(
  field: FieldKey,
  text: string,
  path: string,
): FieldLeaf | null {
  const target = normalizeLeafPath(path)
  return extractLeaves(field, text).find((leaf) => leaf.path === target) ?? null
}

/** 读取叶子值；不存在时返回 null，空字符串与不存在可区分。 */
export function readLeafValue(
  field: FieldKey,
  text: string,
  path: string,
): string | null {
  return findLeaf(field, text, path)?.value ?? null
}

/**
 * 只替换指定叶子的文本，其余字符逐字保留。
 *
 * 返回值里的 `replaced=false` 表示路径不存在或越界，调用方应保持原文本。
 */
export function replaceLeafValue(
  field: FieldKey,
  text: string,
  path: string,
  value: string,
): { text: string; replaced: boolean } {
  const leaf = findLeaf(field, text, path)
  if (!leaf) {
    return { text, replaced: false }
  }
  return {
    text: `${text.slice(0, leaf.start)}${value}${text.slice(leaf.end)}`,
    replaced: true,
  }
}

/** 按叶子路径批量改写，从后往前替换以保持偏移稳定。 */
export function replaceLeafValues(
  field: FieldKey,
  text: string,
  patches: readonly { path: string; value: string }[],
): { text: string; applied: number } {
  const leaves = extractLeaves(field, text)
  const normalized = patches
    .map((patch) => ({
      path: normalizeLeafPath(patch.path),
      value: patch.value,
    }))
    .sort((left, right) => right.path.length - left.path.length)

  const resolved = normalized
    .map((patch) => {
      const leaf = leaves.find((candidate) => candidate.path === patch.path)
      return leaf ? { leaf, value: patch.value } : null
    })
    .filter((item): item is { leaf: FieldLeaf; value: string } => item !== null)
    .sort((left, right) => right.leaf.start - left.leaf.start)

  let next = text
  for (const item of resolved) {
    next = `${next.slice(0, item.leaf.start)}${item.value}${next.slice(item.leaf.end)}`
  }
  return { text: next, applied: resolved.length }
}

const emptyRole = (): PromptSchema['role'] => ({ persona: '' })

const emptyObjective = (): PromptSchema['objective'] => ({
  goal: '',
  successCriteria: [],
  nonGoals: [],
})

const emptyContext = (): PromptSchema['context'] => ({
  background: '',
  knownFacts: [],
})

const emptyInput = (): PromptSchema['input'] => ({ variables: [] })

const emptyConstraints = (): PromptSchema['constraints'] => ({
  must: [],
  mustNot: [],
  boundaries: {
    scopeIn: [],
    scopeOut: [],
    knowledgePolicy: '',
    ambiguityPolicy: '',
  },
  priority: [],
})

const emptyOutput = (): PromptSchema['output'] => ({
  format: 'markdown',
  sections: [],
})

const emptyExamples = (): PromptSchema['examples'] => ({
  items: [],
  negative: [],
})

const emptySelfCheck = (): PromptSchema['selfCheck'] => ({ checklist: [] })

/**
 * 用字段文本构造一份 PromptSchema，供 JSON 视图与结构化消费方使用。
 *
 * 元信息不在字段文本里（标题、任务类型、假设），所以由调用方传入；缺省值保证
 * 空文档也能得到一份可序列化的结构，而不是 null。
 */
export function buildSchemaFromFields(
  fields: Partial<Record<FieldKey, string>>,
  meta: FieldSchemaMeta = {},
): PromptSchema {
  const title = meta.title?.trim() ?? ''
  const roleText = fields.role
  const objectiveText = fields.objective
  const contextText = fields.context
  const inputText = fields.input
  const constraintsText = fields.constraints
  const outputText = fields.output
  const examplesText = fields.examples
  const selfCheckText = fields.selfCheck

  return {
    schemaVersion: 'pp-schema-v1',
    meta: {
      title: title.length >= 2 ? title : '未命名提示词',
      taskType: meta.taskType ?? 'other',
      language: meta.language ?? 'zh',
      mode: meta.mode ?? 'generate',
      templateId: meta.templateId ?? 'field-text-v1',
    },
    assumptions: meta.assumptions ?? [],
    role: roleText === undefined ? emptyRole() : parseField('role', roleText).value,
    objective:
      objectiveText === undefined
        ? emptyObjective()
        : parseField('objective', objectiveText).value,
    context:
      contextText === undefined
        ? emptyContext()
        : parseField('context', contextText).value,
    input:
      inputText === undefined
        ? emptyInput()
        : parseField('input', inputText).value,
    constraints:
      constraintsText === undefined
        ? emptyConstraints()
        : parseField('constraints', constraintsText).value,
    output:
      outputText === undefined
        ? emptyOutput()
        : parseField('output', outputText).value,
    examples:
      examplesText === undefined
        ? emptyExamples()
        : parseField('examples', examplesText).value,
    selfCheck:
      selfCheckText === undefined
        ? emptySelfCheck()
        : parseField('selfCheck', selfCheckText).value,
    linter: { suppressions: [], severityOverride: {} },
  }
}
