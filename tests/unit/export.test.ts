import { describe, expect, it } from 'vitest'
import {
  buildExportAssumptions,
  type ExportedAssumption,
} from '@/lib/engine/assumptions'
import {
  OPENAI_EXPORT_MODEL,
  buildMarkdownExport,
  buildOpenAIMessagesExport,
  exportContentOf,
  type ExportResult,
} from '@/lib/engine/export'
import {
  createSkeletonSchema,
  type Assumption,
  type PromptSchema,
  type PromptVariable,
} from '@/lib/engine/schema'

type Success = Extract<ExportResult, { ok: true }>
type Failure = Extract<ExportResult, { ok: false }>

interface ParsedOpenAI {
  model: string
  messages: Array<{ role: string; content: string }>
  variables: Array<{
    name: string
    placeholder: string
    label: string
    type: string
    required: boolean
    defaultValue?: string
    options?: string[]
    description?: string
  }>
}

function expectOk(result: ExportResult): Success {
  if (!result.ok) {
    throw new Error(
      `预期导出成功，实际失败：${result.issues
        .map((issue) => issue.message)
        .join('；')}`,
    )
  }
  return result
}

function expectFailure(result: ExportResult): Failure {
  if (result.ok) {
    throw new Error('预期导出失败，实际成功')
  }
  return result
}

function variable(
  name: string,
  overrides: Partial<Omit<PromptVariable, 'name'>> = {},
): PromptVariable {
  return {
    name,
    label: '主题',
    type: 'text',
    required: true,
    ...overrides,
  }
}

function makeSchema(
  options: {
    variables?: PromptVariable[]
    background?: string
    goal?: string
    assumptions?: Assumption[]
  } = {},
): PromptSchema {
  const base = createSkeletonSchema('导出测试')
  return {
    ...base,
    input: { variables: options.variables ?? [] },
    context: {
      ...base.context,
      background: options.background ?? base.context.background,
    },
    objective: {
      ...base.objective,
      goal: options.goal ?? base.objective.goal,
    },
    assumptions: options.assumptions ?? [],
  }
}

function parseOpenAI(content: string): ParsedOpenAI {
  return JSON.parse(content) as ParsedOpenAI
}

const ASSUMPTIONS: Assumption[] = [
  {
    path: 'output.language',
    label: '输出语言',
    value: '中文',
    candidates: ['中文', '英文'],
    source: 'default',
  },
]

describe('Markdown 导出', () => {
  it('保留八字段结构与 {{var}} 占位符', () => {
    const schema = makeSchema({
      variables: [
        variable('topic', { label: '主题' }),
        variable('tone', {
          label: '语气',
          type: 'enum',
          required: false,
          options: ['正式', '轻松'],
        }),
      ],
      background: '围绕 {{topic}} 写一段说明，语气取 {{tone}}。',
    })

    const result = expectOk(buildMarkdownExport({ schema }))

    expect(result.content.startsWith('# 导出测试\n')).toBe(true)
    expect(result.content).toContain('## 1. 角色')
    expect(result.content).toContain('## 4. 输入与变量')
    expect(result.content).toContain('## 8. 自检')
    expect(result.content).toContain('{{topic}}')
    expect(result.content).toContain('{{tone}}')
    expect(result.content).toContain('语气取 {{tone}}')
    expect(result.content.endsWith('\n')).toBe(true)
    expect(result.variables.map((item) => item.name)).toEqual([
      'topic',
      'tone',
    ])
  })

  it('含字面量花括号与 ${x} 的正文原样保留，不被误当成变量', () => {
    const literal =
      '字面量 {}、{{literal}} 与 ${x} 原样保留，只有 {{topic}} 是变量。'
    const schema = makeSchema({
      variables: [variable('topic')],
      background: literal,
    })

    const result = expectOk(buildMarkdownExport({ schema }))

    expect(result.content).toContain(literal)
    expect(result.variables.map((item) => item.name)).toEqual(['topic'])
    expect(result.literalPlaceholders).toEqual(['literal'])
    // 没有把未声明的字面量塞进变量清单，也没有替换成空值。
    expect(result.content).not.toContain('字面量 、')
  })

  it('代码围栏内的花括号按字面量处理，不参与占位符校验', () => {
    const background = [
      '下面是一段模板代码：',
      '',
      '```ts',
      'const template = "{{topic"',
      'const value = `${x}`',
      '```',
    ].join('\n')
    const schema = makeSchema({
      variables: [variable('topic')],
      background,
    })

    const result = expectOk(buildMarkdownExport({ schema }))

    expect(result.content).toContain('"{{topic"')
    expect(result.literalPlaceholders).toEqual([])
  })

  it('围栏不成对时给出明确错误，不产出坏文件', () => {
    const schema = makeSchema({
      goal: ['输出一份 JSON：', '', '```json', '{"ok": true}'].join('\n'),
    })

    const failure = expectFailure(buildMarkdownExport({ schema }))

    expect(failure.issues.map((issue) => issue.code)).toContain(
      'unbalanced-fence',
    )
    expect(failure.issues[0]?.message).toContain('代码围栏没有闭合')
  })

  it('围栏成对时正常导出', () => {
    const schema = makeSchema({
      goal: [
        '输出一份 JSON：',
        '',
        '```json',
        '{"ok": true, "label": "{}"}',
        '```',
      ].join('\n'),
    })

    const result = expectOk(buildMarkdownExport({ schema }))

    expect(result.content).toContain('```json')
    expect(result.content).toContain('"label": "{}"')
  })

  it('变量名非法时拒绝导出', () => {
    const schema = makeSchema({
      variables: [variable('1bad')],
    })

    const failure = expectFailure(buildMarkdownExport({ schema }))

    expect(failure.issues[0]?.code).toBe('invalid-variable-name')
    expect(failure.issues[0]?.message).toContain('变量名「1bad」不合法')
    expect(failure.issues[0]?.path).toBe('input.variables[0].name')
  })

  it('变量名重复时拒绝导出', () => {
    const schema = makeSchema({
      variables: [variable('topic'), variable('topic', { label: '另一个' })],
    })

    const failure = expectFailure(buildMarkdownExport({ schema }))

    expect(failure.issues[0]?.code).toBe('duplicate-variable-name')
    expect(failure.issues[0]?.message).toContain('变量名「topic」重复')
  })

  it('占位符缺右花括号时拒绝导出', () => {
    const schema = makeSchema({
      background: '请围绕 {{topic 生成内容。',
    })

    const failure = expectFailure(buildMarkdownExport({ schema }))

    expect(failure.issues[0]?.code).toBe('malformed-placeholder')
    expect(failure.issues[0]?.message).toContain('没有配对的「}}」')
  })

  it('占位符内变量名非法时拒绝导出', () => {
    const schema = makeSchema({
      background: '请围绕 {{topic 名称}} 生成内容。',
    })

    const failure = expectFailure(buildMarkdownExport({ schema }))

    expect(failure.issues[0]?.code).toBe('malformed-placeholder')
    expect(failure.issues[0]?.message).toContain('占位符「{{topic 名称}}」不合法')
  })
})

describe('OpenAI messages 导出', () => {
  it('产物能被 JSON.parse 解析，含角色与变量清单', () => {
    const schema = makeSchema({
      variables: [
        variable('topic', {
          label: '主题',
          description: '要写什么',
        }),
        variable('tone', {
          label: '语气',
          type: 'enum',
          required: false,
          defaultValue: '正式',
          options: ['正式', '轻松'],
        }),
      ],
      background: '围绕 {{topic}} 写一段说明。',
    })

    const result = expectOk(buildOpenAIMessagesExport({ schema }))
    const payload = parseOpenAI(result.content)

    expect(payload.model).toBe(OPENAI_EXPORT_MODEL)
    expect(payload.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
    ])
    expect(payload.messages.every((message) => message.content.length > 0)).toBe(
      true,
    )
    expect(payload.variables.map((item) => item.name)).toEqual([
      'topic',
      'tone',
    ])
    expect(payload.variables[0]).toMatchObject({
      name: 'topic',
      placeholder: '{{topic}}',
      label: '主题',
      type: 'text',
      required: true,
      description: '要写什么',
    })
    expect(payload.variables[1]).toMatchObject({
      name: 'tone',
      placeholder: '{{tone}}',
      type: 'enum',
      required: false,
      defaultValue: '正式',
      options: ['正式', '轻松'],
    })
    expect(payload.messages[1]?.content).toContain('{{topic}}')
  })

  it('含 {}、{{literal}} 与 ${x} 的正文在 JSON 中保持原样', () => {
    const literal =
      '字面量 {}、{{literal}} 与 ${x} 原样保留，只有 {{topic}} 是变量。'
    const schema = makeSchema({
      variables: [variable('topic')],
      background: literal,
    })

    const result = expectOk(buildOpenAIMessagesExport({ schema }))
    const payload = parseOpenAI(result.content)

    expect(payload.messages[1]?.content).toContain(literal)
    expect(payload.variables.map((item) => item.name)).toEqual(['topic'])
    expect(result.literalPlaceholders).toEqual(['literal'])
  })

  it('变量名非法时拒绝导出，不返回半成品 JSON', () => {
    const schema = makeSchema({
      variables: [variable('bad-name')],
    })

    const failure = expectFailure(buildOpenAIMessagesExport({ schema }))

    expect(failure.issues[0]?.code).toBe('invalid-variable-name')
    expect('content' in failure).toBe(false)
  })

  it('占位符不完整时拒绝导出', () => {
    const schema = makeSchema({
      background: '请替换 {{topic 后使用。',
    })

    const failure = expectFailure(buildOpenAIMessagesExport({ schema }))

    expect(failure.issues[0]?.code).toBe('malformed-placeholder')
    expect('content' in failure).toBe(false)
  })
})

describe('假设注释开关', () => {
  it('不剔除时两种格式都带上假设注释', () => {
    const schema = makeSchema({ variables: [variable('topic')] })
    const included: ExportedAssumption[] = buildExportAssumptions(
      ASSUMPTIONS,
      { omitAssumptions: false },
    )

    const markdown = expectOk(
      buildMarkdownExport({ schema, assumptions: included }),
    )
    expect(markdown.content).toContain('## 生成假设')
    expect(markdown.content).toContain('> 假设：输出语言 = 中文')

    const openai = expectOk(
      buildOpenAIMessagesExport({ schema, assumptions: included }),
    )
    const payload = parseOpenAI(openai.content)
    expect(payload.messages[0]?.content).toContain('> 假设：输出语言 = 中文')
  })

  it('剔除后两种格式都不出现假设注释', () => {
    const schema = makeSchema({ variables: [variable('topic')] })
    const omitted: ExportedAssumption[] = buildExportAssumptions(
      ASSUMPTIONS,
      { omitAssumptions: true },
    )

    const markdown = expectOk(
      buildMarkdownExport({ schema, assumptions: omitted }),
    )
    expect(markdown.content).not.toContain('生成假设')
    expect(markdown.content).not.toContain('假设：')

    const openai = expectOk(
      buildOpenAIMessagesExport({ schema, assumptions: omitted }),
    )
    const payload = parseOpenAI(openai.content)
    expect(payload.messages[0]?.content).not.toContain('生成假设')
    expect(payload.messages[0]?.content).not.toContain('假设：')
  })

  it('假设值含换行时压平成一行，不破坏引用块', () => {
    const multiline: Assumption[] = [
      {
        path: 'output.tone',
        label: '语气',
        value: '专业\n克制',
        candidates: [],
        source: 'inferred',
      },
    ]
    const schema = makeSchema({})
    const included = buildExportAssumptions(multiline, {
      omitAssumptions: false,
    })

    const result = expectOk(
      buildMarkdownExport({ schema, assumptions: included }),
    )

    expect(result.content).toContain('> 假设：语气 = 专业 克制')
  })
})

describe('纯函数与结果形状', () => {
  it('同一输入得到同一输出，且不修改入参 schema', () => {
    const schema = makeSchema({
      variables: [variable('topic')],
      background: '围绕 {{topic}} 写一段说明。',
    })
    const before = JSON.stringify(schema)

    const first = expectOk(buildMarkdownExport({ schema }))
    const second = expectOk(buildMarkdownExport({ schema }))
    const firstJson = expectOk(buildOpenAIMessagesExport({ schema }))
    const secondJson = expectOk(buildOpenAIMessagesExport({ schema }))

    expect(first.content).toBe(second.content)
    expect(firstJson.content).toBe(secondJson.content)
    expect(JSON.stringify(schema)).toBe(before)
  })

  it('exportContentOf 只在成功时返回内容', () => {
    const ok = expectOk(buildMarkdownExport({ schema: makeSchema() }))
    expect(exportContentOf(ok)).toBe(ok.content)

    const failure = expectFailure(
      buildMarkdownExport({
        schema: makeSchema({ variables: [variable('bad name')] }),
      }),
    )
    expect(exportContentOf(failure)).toBeNull()
  })
})
