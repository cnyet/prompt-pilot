import {
  FIELD_KEYS,
  FIELD_LABELS,
  type FieldKey,
  type OutputFormat,
  type PromptSchema,
  type PromptVariable,
  type TaskType,
} from './schema'

/**
 * 结构化提示词到文本的纯函数渲染层。
 *
 * 这里同时提供两档粒度：
 * - `renderFieldSegments` 给 SSE 逐字段流式使用，每条 segment 的 `path` 是点号字段路径；
 * - `renderFieldText` / `renderMarkdownDocument` 给编辑区与复制使用。
 *
 * 所有输出只依赖入参，不读环境、不发请求，便于单测与客户端复用。
 */

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  qa: '通用问答',
  writing: '内容创作',
  coding: '代码生成',
  analysis: '数据分析',
  extraction: '结构化抽取',
  conversation: '客服对话',
  planning: '任务规划',
  transformation: '内容改写',
  other: '通用任务',
}

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  markdown: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  table: '表格',
  plain: '纯文本',
  code: '代码',
  xml: 'XML',
}

export const VARIABLE_TYPE_LABELS: Record<PromptVariable['type'], string> = {
  text: '短文本',
  longtext: '长文本',
  number: '数字',
  enum: '枚举',
  json: 'JSON',
  boolean: '布尔值',
}

export interface FieldSegment {
  path: string
  text: string
}

export interface MarkdownDocumentInput {
  title: string
  fields: Partial<Record<FieldKey, string>>
}

const FIELD_ORDER = new Map<FieldKey, number>(
  FIELD_KEYS.map((key, index) => [key, index + 1] as const),
)

export function fieldHeading(field: FieldKey): string {
  return `${FIELD_ORDER.get(field) ?? 0}. ${FIELD_LABELS[field]}`
}

function pushList(
  segments: FieldSegment[],
  path: string,
  header: string,
  items: readonly string[],
  emptyText: string,
): void {
  if (items.length === 0) {
    segments.push({ path, text: `${header}：${emptyText}\n` })
    return
  }
  segments.push({ path, text: `${header}：\n` })
  items.forEach((item, index) => {
    segments.push({ path: `${path}.${index}`, text: `- ${item}\n` })
  })
}

function roleSegments(role: PromptSchema['role']): FieldSegment[] {
  const segments: FieldSegment[] = [
    { path: 'role.persona', text: `你是谁：${role.persona}\n` },
  ]
  if (role.expertise) {
    segments.push({ path: 'role.expertise', text: `专长：${role.expertise}\n` })
  }
  if (role.stance) {
    segments.push({ path: 'role.stance', text: `视角：${role.stance}\n` })
  }
  return segments
}

function objectiveSegments(objective: PromptSchema['objective']): FieldSegment[] {
  const segments: FieldSegment[] = [
    { path: 'objective.goal', text: `目标：${objective.goal}\n` },
  ]
  pushList(
    segments,
    'objective.successCriteria',
    '成功标准',
    objective.successCriteria,
    '无',
  )
  pushList(segments, 'objective.nonGoals', '不追求', objective.nonGoals, '无')
  return segments
}

function contextSegments(context: PromptSchema['context']): FieldSegment[] {
  const segments: FieldSegment[] = [
    { path: 'context.background', text: `背景：${context.background}\n` },
  ]
  if (context.audience) {
    segments.push({ path: 'context.audience', text: `受众：${context.audience}\n` })
  }
  pushList(segments, 'context.knownFacts', '已知事实', context.knownFacts, '无')
  if (context.missingInputPolicy) {
    segments.push({
      path: 'context.missingInputPolicy',
      text: `缺少输入时：${context.missingInputPolicy}\n`,
    })
  }
  return segments
}

function inputSegments(input: PromptSchema['input']): FieldSegment[] {
  const segments: FieldSegment[] = []
  if (input.variables.length === 0) {
    segments.push({
      path: 'input.variables',
      text: '变量：无。该提示词不依赖外部变量，可直接使用。\n',
    })
    return segments
  }

  segments.push({ path: 'input.variables', text: '变量：\n' })
  for (const variable of input.variables) {
    const flags = [
      VARIABLE_TYPE_LABELS[variable.type],
      variable.required ? '必填' : '可选',
    ]
    if (variable.defaultValue) {
      flags.push(`默认值：${variable.defaultValue}`)
    }
    if (variable.options && variable.options.length > 0) {
      flags.push(`可选值：${variable.options.join(' / ')}`)
    }
    if (variable.description) {
      flags.push(variable.description)
    }
    segments.push({
      path: `input.variables.${variable.name}`,
      text: `- {{${variable.name}}}：${variable.label}（${flags.join('，')}）\n`,
    })
  }
  return segments
}

function constraintSegments(
  constraints: PromptSchema['constraints'],
): FieldSegment[] {
  const segments: FieldSegment[] = []
  pushList(segments, 'constraints.must', '必须', constraints.must, '无特别要求')
  pushList(segments, 'constraints.mustNot', '禁止', constraints.mustNot, '无')

  const boundaries = constraints.boundaries
  pushList(
    segments,
    'constraints.boundaries.scopeIn',
    '范围内',
    boundaries.scopeIn,
    '无',
  )
  pushList(
    segments,
    'constraints.boundaries.scopeOut',
    '明确不做',
    boundaries.scopeOut,
    '无',
  )
  segments.push({
    path: 'constraints.boundaries.knowledgePolicy',
    text: `知识不足时：${boundaries.knowledgePolicy}\n`,
  })
  segments.push({
    path: 'constraints.boundaries.ambiguityPolicy',
    text: `输入有歧义时：${boundaries.ambiguityPolicy}\n`,
  })
  if (boundaries.formatBoundary) {
    segments.push({
      path: 'constraints.boundaries.formatBoundary',
      text: `格式边界：${boundaries.formatBoundary}\n`,
    })
  }
  if (boundaries.safetyBoundary) {
    segments.push({
      path: 'constraints.boundaries.safetyBoundary',
      text: `安全边界：${boundaries.safetyBoundary}\n`,
    })
  }
  pushList(
    segments,
    'constraints.priority',
    '冲突时的优先级',
    constraints.priority,
    '无',
  )
  return segments
}

function outputSegments(output: PromptSchema['output']): FieldSegment[] {
  const segments: FieldSegment[] = [
    { path: 'output.format', text: `格式：${FORMAT_LABELS[output.format]}\n` },
  ]
  if (output.schema) {
    segments.push({ path: 'output.schema', text: `结构：${output.schema}\n` })
  }
  pushList(segments, 'output.sections', '章节', output.sections, '无')
  if (output.length) {
    segments.push({ path: 'output.length', text: `长度：${output.length}\n` })
  }
  if (output.language) {
    segments.push({ path: 'output.language', text: `语言：${output.language}\n` })
  }
  if (output.tone) {
    segments.push({ path: 'output.tone', text: `语气：${output.tone}\n` })
  }
  return segments
}

function exampleSegments(examples: PromptSchema['examples']): FieldSegment[] {
  const segments: FieldSegment[] = []
  if (examples.items.length === 0) {
    segments.push({
      path: 'examples.items',
      text: '正例：暂无，可在迭代时补充。\n',
    })
  } else {
    segments.push({ path: 'examples.items', text: '正例：\n' })
    examples.items.forEach((item, index) => {
      segments.push({
        path: `examples.items.${index}.input`,
        text: `- 输入：${item.input}\n`,
      })
      segments.push({
        path: `examples.items.${index}.output`,
        text: `  输出：${item.output}\n`,
      })
      if (item.note) {
        segments.push({
          path: `examples.items.${index}.note`,
          text: `  说明：${item.note}\n`,
        })
      }
    })
  }

  if (examples.negative.length === 0) {
    segments.push({
      path: 'examples.negative',
      text: '反例：暂无，可在迭代时补充。\n',
    })
  } else {
    segments.push({ path: 'examples.negative', text: '反例：\n' })
    examples.negative.forEach((item, index) => {
      segments.push({
        path: `examples.negative.${index}.input`,
        text: `- 输入：${item.input}\n`,
      })
      segments.push({
        path: `examples.negative.${index}.badOutput`,
        text: `  不期望输出：${item.badOutput}\n`,
      })
      segments.push({
        path: `examples.negative.${index}.why`,
        text: `  原因：${item.why}\n`,
      })
    })
  }
  return segments
}

function selfCheckSegments(selfCheck: PromptSchema['selfCheck']): FieldSegment[] {
  const segments: FieldSegment[] = []
  pushList(segments, 'selfCheck.checklist', '自检清单', selfCheck.checklist, '无')
  if (selfCheck.onFail) {
    segments.push({
      path: 'selfCheck.onFail',
      text: `自检不通过时：${selfCheck.onFail}\n`,
    })
  }
  return segments
}

function assertNever(value: never): never {
  throw new Error(`未知字段：${String(value)}`)
}

/** 渲染单个字段的流式片段。拼接所有片段即得到该字段的可读文本。 */
export function renderFieldSegments(
  schema: PromptSchema,
  field: FieldKey,
): FieldSegment[] {
  switch (field) {
    case 'role':
      return roleSegments(schema.role)
    case 'objective':
      return objectiveSegments(schema.objective)
    case 'context':
      return contextSegments(schema.context)
    case 'input':
      return inputSegments(schema.input)
    case 'constraints':
      return constraintSegments(schema.constraints)
    case 'output':
      return outputSegments(schema.output)
    case 'examples':
      return exampleSegments(schema.examples)
    case 'selfCheck':
      return selfCheckSegments(schema.selfCheck)
    default:
      return assertNever(field)
  }
}

/** 单个字段的可读文本，供编辑区与 Markdown 复制使用。 */
export function renderFieldText(schema: PromptSchema, field: FieldKey): string {
  return renderFieldSegments(schema, field)
    .map((segment) => segment.text)
    .join('')
    .trimEnd()
}

/**
 * 把标题与各字段文本拼成可直接粘贴到对话窗口的 Markdown。
 * 空字段会被跳过，避免把未生成内容当成正文发出去。
 */
export function renderMarkdownDocument(input: MarkdownDocumentInput): string {
  const title = input.title.replace(/\s+/g, ' ').trim() || '未命名提示词'
  const parts: string[] = [`# ${title}`]

  for (const field of FIELD_KEYS) {
    const body = input.fields[field]?.trim()
    if (!body) {
      continue
    }
    parts.push(`## ${fieldHeading(field)}\n\n${body}`)
  }

  return `${parts.join('\n\n').trimEnd()}\n`
}

/** 结构化文档一次性渲染为 Markdown，主要用于导出与测试。 */
export function renderSchemaMarkdown(schema: PromptSchema): string {
  const fields: Partial<Record<FieldKey, string>> = {}
  for (const field of FIELD_KEYS) {
    fields[field] = renderFieldText(schema, field)
  }
  return renderMarkdownDocument({ title: schema.meta.title, fields })
}
