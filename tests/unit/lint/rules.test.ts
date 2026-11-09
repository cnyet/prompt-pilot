import { describe, expect, it } from 'vitest'
import { diagnose } from '@/lib/engine/lint/engine'
import type { LintRuleId } from '@/lib/engine/lint/types'
import { createLintFixture } from '@/tests/fixtures/lint/schemas'

function issuesFor(schema: ReturnType<typeof createLintFixture>, ruleId: LintRuleId) {
  return diagnose(schema).filter((issue) => issue.ruleId === ruleId)
}

describe('lint 基准样本', () => {
  it('完整且自洽的 schema 不产生任何问题（16 条规则的反例基线）', () => {
    expect(diagnose(createLintFixture())).toEqual([])
  })
})

describe('R001 模糊限定词', () => {
  it('正例：命中小范围模糊词并给出精确区间', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'

    const [issue] = issuesFor(schema, 'R001')
    expect(issue).toBeDefined()
    expect(issue?.level).toBe('warn')
    expect(issue?.path).toBe('objective.goal')
    expect(issue?.fixable).toBe(true)
    expect(issue?.data?.word).toBe('尽量')
    expect(schema.objective.goal.slice(issue?.span?.[0] ?? 0, issue?.span?.[1] ?? 0)).toBe('尽量')
  })

  it('反例：干净文本不触发', () => {
    expect(issuesFor(createLintFixture(), 'R001')).toEqual([])
  })
})

describe('R002 缺输出格式', () => {
  it('正例：结构化任务 sections 为空时报 error', () => {
    const schema = createLintFixture()
    schema.output.sections = []

    const [issue] = issuesFor(schema, 'R002')
    expect(issue?.level).toBe('error')
    expect(issue?.path).toBe('output.sections')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：qa 任务用 plain 且无 sections 时不报', () => {
    const schema = createLintFixture()
    schema.meta.taskType = 'qa'
    schema.output.format = 'plain'
    schema.output.sections = []

    expect(issuesFor(schema, 'R002')).toEqual([])
  })
})

describe('R003 角色缺失或过于笼统', () => {
  it('正例：通用称谓时报 warn', () => {
    const schema = createLintFixture()
    schema.role.persona = '助手'

    const [issue] = issuesFor(schema, 'R003')
    expect(issue?.level).toBe('warn')
    expect(issue?.path).toBe('role.persona')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：具体角色不触发', () => {
    expect(issuesFor(createLintFixture(), 'R003')).toEqual([])
  })
})

describe('R004 缺可核对的成功标准', () => {
  it('正例：只有占位标准时报 error', () => {
    const schema = createLintFixture()
    schema.objective.successCriteria = ['待补充']

    const [issue] = issuesFor(schema, 'R004')
    expect(issue?.level).toBe('error')
    expect(issue?.path).toBe('objective.successCriteria')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：有可核对标准时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R004')).toEqual([])
  })
})

describe('R005 缺「明确不做」清单', () => {
  it('正例：scopeOut 为空时报 error', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.scopeOut = []

    const [issue] = issuesFor(schema, 'R005')
    expect(issue?.level).toBe('error')
    expect(issue?.path).toBe('constraints.boundaries.scopeOut')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：有明确排除项时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R005')).toEqual([])
  })
})

describe('R006 缺知识不足时的行为约定', () => {
  it('正例：knowledgePolicy 为空时报 error', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.knowledgePolicy = ''

    const [issue] = issuesFor(schema, 'R006')
    expect(issue?.level).toBe('error')
    expect(issue?.path).toBe('constraints.boundaries.knowledgePolicy')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：写明策略时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R006')).toEqual([])
  })
})

describe('R007 缺歧义处理策略', () => {
  it('正例：占位策略时报 warn', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.ambiguityPolicy = '待补充'

    const [issue] = issuesFor(schema, 'R007')
    expect(issue?.level).toBe('warn')
    expect(issue?.path).toBe('constraints.boundaries.ambiguityPolicy')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：写明歧义策略时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R007')).toEqual([])
  })
})

describe('R008 矛盾约束', () => {
  it('正例（详略轴）：详细展开与保持简洁同时出现', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['尽可能详细地展开每个判断', '同时保持简洁']

    const [issue] = issuesFor(schema, 'R008')
    expect(issue?.level).toBe('error')
    expect(issue?.data?.axis).toBe('detail')
    expect(issue?.fixable).toBe(false)
  })

  it('正例（长度轴）：下限 1200 字高于上限 800 字', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['全文不少于 1200 字']
    schema.output.length = '控制在 800 字以内'

    const [issue] = issuesFor(schema, 'R008')
    expect(issue?.data?.axis).toBe('length')
    expect(issue?.message).toContain('1200')
    expect(issue?.message).toContain('800')
  })

  it('正例（正式度轴）：正式书面语与轻松幽默冲突', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['全文使用正式书面语']
    schema.output.tone = '轻松幽默'

    const [issue] = issuesFor(schema, 'R008')
    expect(issue?.data?.axis).toBe('formality')
  })

  it('正例（格式轴）：output.format 为 json 但约束要求 Markdown', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['用 Markdown 输出']
    schema.output.format = 'json'

    const [issue] = issuesFor(schema, 'R008')
    expect(issue?.data?.axis).toBe('format')
    expect(issue?.message).toContain('json')
    expect(issue?.message).toContain('markdown')
  })

  it('正例（跨轴）：输出要非常详细，同时限制在 50 字以内（AC-4）', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['输出要非常详细']
    schema.output.length = '控制在 50 字以内'

    const [issue] = issuesFor(schema, 'R008')
    expect(issue?.level).toBe('error')
    expect(issue?.data?.axis).toBe('detail')
    expect(issue?.message).toContain('50')
  })

  it('反例：自洽约束不触发', () => {
    expect(issuesFor(createLintFixture(), 'R008')).toEqual([])
  })

  it('反例：转换任务里的「把 JSON 转成 YAML」不是输出格式冲突', () => {
    const schema = createLintFixture()
    schema.meta.taskType = 'transformation'
    schema.constraints.must = ['把输入 JSON 转成 YAML']
    schema.constraints.boundaries.formatBoundary = ''
    schema.output.format = 'yaml'

    expect(issuesFor(schema, 'R008')).toEqual([])
  })
})

describe('R009 不可验证的形容词', () => {
  it('正例：命中形容词并给出替换判据', () => {
    const schema = createLintFixture()
    schema.objective.goal = '输出一份专业的经营分析报告'

    const [issue] = issuesFor(schema, 'R009')
    expect(issue?.level).toBe('warn')
    expect(issue?.data?.word).toBe('专业')
    expect(issue?.fixable).toBe(true)
    expect(issue?.suggestion).toContain('术语准确')
  })

  it('反例：没有不可验证形容词时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R009')).toEqual([])
  })
})

describe('R010 缺长度或规模约束', () => {
  it('正例：没有任何字数或规模约束时报 info', () => {
    const schema = createLintFixture()
    schema.output.length = ''

    const [issue] = issuesFor(schema, 'R010')
    expect(issue?.level).toBe('info')
    expect(issue?.path).toBe('output.length')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：已有字数约束时不触发', () => {
    expect(issuesFor(createLintFixture(), 'R010')).toEqual([])
  })
})

describe('R011 正文引用了未声明的变量', () => {
  it('正例：正文出现 {{topic}} 但变量未声明', () => {
    const schema = createLintFixture()
    schema.context.background += '；请围绕 {{topic}} 展开。'

    const [issue] = issuesFor(schema, 'R011')
    expect(issue?.level).toBe('error')
    expect(issue?.path).toBe('context.background')
    expect(issue?.fixable).toBe(true)
    expect(issue?.data?.variableName).toBe('topic')
    expect(schema.context.background.slice(issue?.span?.[0] ?? 0, issue?.span?.[1] ?? 0)).toBe('{{topic}}')
  })

  it('反例：变量已声明时不触发', () => {
    const schema = createLintFixture()
    schema.context.background += '；请围绕 {{topic}} 展开。'
    schema.input.variables.push({ name: 'topic', label: '主题', type: 'text', required: true })

    expect(issuesFor(schema, 'R011')).toEqual([])
  })
})

describe('R012 声明了变量但正文未使用', () => {
  it('正例：声明变量后正文没有引用', () => {
    const schema = createLintFixture()
    schema.input.variables.push({ name: 'topic', label: '主题', type: 'text', required: true })

    const [issue] = issuesFor(schema, 'R012')
    expect(issue?.level).toBe('warn')
    expect(issue?.path).toBe('input.variables[0]')
    expect(issue?.fixable).toBe(true)
    expect(issue?.data?.variableName).toBe('topic')
  })

  it('反例：正文中引用了变量时不触发', () => {
    const schema = createLintFixture()
    schema.context.background += '；请围绕 {{topic}} 展开。'
    schema.input.variables.push({ name: 'topic', label: '主题', type: 'text', required: true })

    expect(issuesFor(schema, 'R012')).toEqual([])
  })
})

describe('R013 指代不明', () => {
  it('正例：字段开头出现「它」且没有先行词', () => {
    const schema = createLintFixture()
    schema.context.background = '它必须包含数据。'

    const [issue] = issuesFor(schema, 'R013')
    expect(issue?.level).toBe('info')
    expect(issue?.path).toBe('context.background')
    expect(issue?.data?.word).toBe('它')
    expect(issue?.fixable).toBe(false)
  })

  it('反例：前文已经出现先行词时不触发', () => {
    const schema = createLintFixture()
    schema.context.background = '生成一份报告。它必须包含数据。'

    expect(issuesFor(schema, 'R013')).toEqual([])
  })

  it('反例：「应该」不是指代词', () => {
    const schema = createLintFixture()
    schema.context.background = '应该先确认口径，再开始分析。'

    expect(issuesFor(schema, 'R013')).toEqual([])
  })
})

describe('R014 提示词过长', () => {
  it('正例：超过 warn 阈值时报 warn', () => {
    const schema = createLintFixture()

    const [issue] = diagnose(schema, { tokenWarnThreshold: 10 }).filter((item) => item.ruleId === 'R014')
    expect(issue?.level).toBe('warn')
    expect(issue?.path).toBe('$')
    expect(issue?.fixable).toBe(false)
  })

  it('正例：超过 error 阈值时报 error', () => {
    const schema = createLintFixture()

    const [issue] = diagnose(schema, { estimateTokens: () => 5000 }).filter(
      (item) => item.ruleId === 'R014',
    )
    expect(issue?.level).toBe('error')
  })

  it('反例：阈值内不触发', () => {
    expect(issuesFor(createLintFixture(), 'R014')).toEqual([])
  })
})

describe('R015 示例敏感型任务缺示例', () => {
  it('正例：extraction 任务没有示例时报 info', () => {
    const schema = createLintFixture()
    schema.meta.taskType = 'extraction'

    const [issue] = issuesFor(schema, 'R015')
    expect(issue?.level).toBe('info')
    expect(issue?.path).toBe('examples.items')
    expect(issue?.fixable).toBe(false)
  })

  it('反例：已有示例时不触发', () => {
    const schema = createLintFixture()
    schema.meta.taskType = 'extraction'
    schema.examples.items.push({ input: '一份合同', output: '{"金额":"100"}' })

    expect(issuesFor(schema, 'R015')).toEqual([])
  })
})

describe('R016 must 清单过长且未分组', () => {
  const nineItems = [
    '输出使用 Markdown 标题',
    '正文分为三个部分',
    '结论放在第一部分',
    '依据放在第二部分',
    '风险放在第三部分',
    '引用数据标注来源',
    '数字保留两位小数',
    '不使用未经确认的预测',
    '最后给出行动建议',
  ]

  it('正例：9 条 must 未分组时报 info', () => {
    const schema = createLintFixture()
    schema.constraints.must = [...nineItems]

    const [issue] = issuesFor(schema, 'R016')
    expect(issue?.level).toBe('info')
    expect(issue?.path).toBe('constraints.must')
    expect(issue?.fixable).toBe(true)
  })

  it('反例：已用【主题】前缀分组时不触发', () => {
    const schema = createLintFixture()
    schema.constraints.must = nineItems.map((item, index) => (index === 0 ? `【格式】${item}` : item))

    expect(issuesFor(schema, 'R016')).toEqual([])
  })

  it('反例：只有 8 条时不触发', () => {
    const schema = createLintFixture()
    schema.constraints.must = nineItems.slice(0, 8)

    expect(issuesFor(schema, 'R016')).toEqual([])
  })
})
