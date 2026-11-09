import { describe, expect, it } from 'vitest'
import { composePrompt } from '@/lib/engine/compose'
import { renderFieldText, FORMAT_LABELS } from '@/lib/engine/render'
import {
  FIELD_KEYS,
  PromptPilotSchemaV1,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import {
  buildSchemaFromFields,
  extractLeaves,
  fieldKeyOfPath,
  findLeaf,
  normalizeLeafPath,
  parseField,
  readLeafValue,
  replaceLeafValue,
  replaceLeafValues,
} from '@/lib/engine/paths'

const requirement =
  '帮我写一份产品需求评审周报，给业务负责人看，输出 Markdown，800 字左右'

const schema = composePrompt(requirement)

function renderAll(source: PromptSchema): Record<FieldKey, string> {
  const texts = {} as Record<FieldKey, string>
  for (const field of FIELD_KEYS) {
    texts[field] = renderFieldText(source, field)
  }
  return texts
}

const texts = renderAll(schema)

describe('字段文本与结构化路径往返', () => {
  it('八个字段从 schema 渲染后能解析回同一结构', () => {
    for (const field of FIELD_KEYS) {
      expect(parseField(field, texts[field]).value, field).toEqual(schema[field])
    }
  })

  it('用字段文本重建的 schema 与原始 schema 逐字段相等', () => {
    const rebuilt = buildSchemaFromFields(texts, {
      title: schema.meta.title,
      taskType: schema.meta.taskType,
      language: schema.meta.language,
      mode: schema.meta.mode,
      templateId: schema.meta.templateId,
      assumptions: schema.assumptions,
    })
    expect(rebuilt).toEqual(schema)
  })

  it('覆盖假设 chip 会命中的五条路径', () => {
    const expected: ReadonlyArray<[string, string | undefined]> = [
      ['output.language', schema.output.language],
      ['output.length', schema.output.length],
      ['output.format', FORMAT_LABELS[schema.output.format]],
      ['context.audience', schema.context.audience],
      ['output.tone', schema.output.tone],
    ]

    for (const [path, value] of expected) {
      const field = fieldKeyOfPath(path)
      expect(field, path).not.toBeNull()
      if (!field || value === undefined) {
        throw new Error(`缺少路径或取值：${path}`)
      }
      expect(readLeafValue(field, texts[field], path), path).toBe(value)
    }
  })

  it('列表叶子按方括号下标定位', () => {
    expect(
      readLeafValue('constraints', texts.constraints, 'constraints.must[0]'),
    ).toBe(schema.constraints.must[0])
    expect(
      readLeafValue(
        'objective',
        texts.objective,
        'objective.successCriteria[1]',
      ),
    ).toBe(schema.objective.successCriteria[1])
    expect(
      readLeafValue('selfCheck', texts.selfCheck, 'selfCheck.checklist[0]'),
    ).toBe(schema.selfCheck.checklist[0])
    expect(
      readLeafValue(
        'examples',
        texts.examples,
        'examples.negative[0].badOutput',
      ),
    ).toBe(schema.examples.negative[0]?.badOutput)
  })

  it('点号下标归一化为方括号路径', () => {
    expect(normalizeLeafPath('constraints.must.0')).toBe('constraints.must[0]')
    expect(normalizeLeafPath('input.variables.0.label')).toBe(
      'input.variables[0].label',
    )
    expect(normalizeLeafPath('output.language')).toBe('output.language')
    expect(
      findLeaf('constraints', texts.constraints, 'constraints.must.0')?.value,
    ).toBe(schema.constraints.must[0])
  })
})

describe('按叶子路径改写字段文本', () => {
  it('替换 output.language 只动该叶子，其余字符逐字不变', () => {
    const before = texts.output
    const result = replaceLeafValue('output', before, 'output.language', '英文')

    expect(result.replaced).toBe(true)
    expect(result.text).toContain('语言：英文')
    expect(result.text.replace('语言：英文', '语言：中文')).toBe(before)

    const parsed = parseField('output', result.text).value
    expect(parsed.language).toBe('英文')
    expect(parsed.format).toBe(schema.output.format)
    expect(parsed.tone).toBe(schema.output.tone)
    expect(parsed.length).toBe(schema.output.length)
  })

  it('替换 context.audience 后可被 schema 重建读到', () => {
    const result = replaceLeafValue(
      'context',
      texts.context,
      'context.audience',
      '刚入职的运营同事',
    )
    expect(result.replaced).toBe(true)
    const rebuilt = buildSchemaFromFields(
      { ...texts, context: result.text },
      { title: schema.meta.title },
    )
    expect(rebuilt.context.audience).toBe('刚入职的运营同事')
    expect(rebuilt.context.background).toBe(schema.context.background)
  })

  it('批量改写按叶子定位，未命中的路径不报错', () => {
    const before = texts.constraints
    const first = schema.constraints.must[0]
    const second = schema.constraints.must[1]
    if (first === undefined || second === undefined) {
      throw new Error('测试数据缺少 constraints.must')
    }

    const result = replaceLeafValues('constraints', before, [
      { path: 'constraints.must[0]', value: '先确认目标与受众。' },
      { path: 'constraints.must.1', value: '所有结论标注依据。' },
      { path: 'constraints.must[99]', value: '不存在。' },
    ])

    expect(result.applied).toBe(2)
    const parsed = parseField('constraints', result.text).value
    expect(parsed.must[0]).toBe('先确认目标与受众。')
    expect(parsed.must[1]).toBe('所有结论标注依据。')
    expect(parsed.must[2]).toBe(schema.constraints.must[2])
    expect(parsed.mustNot).toEqual(schema.constraints.mustNot)
  })

  it('未知路径保持原文本不变', () => {
    const result = replaceLeafValue(
      'output',
      texts.output,
      'output.notExists',
      'x',
    )
    expect(result.replaced).toBe(false)
    expect(result.text).toBe(texts.output)
  })
})

describe('变量叶子', () => {
  const withVariable = PromptPilotSchemaV1.parse({
    schemaVersion: 'pp-schema-v1',
    meta: { title: '变量测试', taskType: 'qa', language: 'zh' },
    role: { persona: '助手' },
    objective: { goal: '回答问题' },
    context: { background: '背景' },
    input: {
      variables: [
        {
          name: 'topic',
          label: '主题',
          type: 'text',
          required: true,
          defaultValue: '定价',
          options: ['定价', '增长'],
          description: '用户要问的主题',
        },
      ],
    },
    constraints: {
      boundaries: {
        scopeIn: [],
        scopeOut: [],
        knowledgePolicy: '',
        ambiguityPolicy: '',
      },
    },
    output: { format: 'markdown' },
  })

  const inputText = renderFieldText(withVariable, 'input')

  it('变量行解析出名称、标签、类型、必填、默认值、可选值与说明', () => {
    expect(parseField('input', inputText).value.variables).toEqual(
      withVariable.input.variables,
    )
    expect(
      readLeafValue('input', inputText, 'input.variables[0].name'),
    ).toBe('topic')
    expect(
      readLeafValue('input', inputText, 'input.variables[0].label'),
    ).toBe('主题')
    expect(
      readLeafValue('input', inputText, 'input.variables[0].defaultValue'),
    ).toBe('定价')
    expect(
      readLeafValue('input', inputText, 'input.variables[0].options'),
    ).toBe('定价 / 增长')
  })

  it('替换变量标签只影响该变量的标签', () => {
    const result = replaceLeafValue(
      'input',
      inputText,
      'input.variables[0].label',
      '讨论主题',
    )
    expect(result.replaced).toBe(true)
    const parsed = parseField('input', result.text).value
    expect(parsed.variables[0]?.name).toBe('topic')
    expect(parsed.variables[0]?.label).toBe('讨论主题')
    expect(parsed.variables[0]?.defaultValue).toBe('定价')
  })
})

describe('解析容错', () => {
  it('非规范文本不抛错，返回空叶子与默认结构', () => {
    const parsed = parseField('output', '这是一段用户随手写的文本。')
    expect(parsed.leaves).toHaveLength(0)
    expect(parsed.value.format).toBe('markdown')
  })

  it('空字段构造的 schema 仍可序列化', () => {
    const empty = buildSchemaFromFields({}, { title: '空文档' })
    expect(empty.meta.title).toBe('空文档')
    expect(empty.output.format).toBe('markdown')
    expect(JSON.stringify(empty).length).toBeGreaterThan(0)
  })

  it('叶子路径所属字段可反查', () => {
    expect(fieldKeyOfPath('constraints.must[0]')).toBe('constraints')
    expect(fieldKeyOfPath('output.language')).toBe('output')
    expect(fieldKeyOfPath('unknown.path')).toBeNull()
    expect(extractLeaves('role', texts.role).length).toBeGreaterThan(0)
  })
})
