import { describe, expect, it, vi } from 'vitest'
import {
  ComposeInputError,
  MAX_REQUIREMENT_LENGTH,
  classifyTaskType,
  composePrompt,
} from '@/lib/engine/compose'
import { FIELD_KEYS, PromptPilotSchemaV1 } from '@/lib/engine/schema'

describe('离线启发式 composer', () => {
  it('同一输入永远得到同一份文档', () => {
    const input = '帮我写一份产品评审会议程'
    expect(composePrompt(input)).toEqual(composePrompt(input))
  })

  it('输出通过 Schema 校验，且八字段齐全', () => {
    const schema = composePrompt('帮我写一份产品评审会议程')
    expect(PromptPilotSchemaV1.safeParse(schema).success).toBe(true)
    for (const field of FIELD_KEYS) {
      expect(schema).toHaveProperty(field)
      expect(schema[field]).toBeTypeOf('object')
    }
    expect(FIELD_KEYS).toHaveLength(8)
  })

  it('按关键词识别任务类型', () => {
    expect(classifyTaskType('帮我写个周报')).toBe('writing')
    expect(classifyTaskType('用 TypeScript 写一个解析 CSV 的函数')).toBe('coding')
    expect(classifyTaskType('从订单邮件里抽取订单号和金额')).toBe('extraction')
    expect(classifyTaskType('把这段客服话术改成更专业的版本')).toBe('transformation')
    expect(classifyTaskType('分析这份月度销售数据')).toBe('analysis')
    expect(classifyTaskType('给产品评审会写一份议程')).toBe('planning')
    expect(classifyTaskType('什么是向量数据库')).toBe('qa')
    expect(classifyTaskType('设计一版客服对话流程')).toBe('conversation')
    expect(classifyTaskType('帮我排期一次产品发布计划')).toBe('planning')
    expect(classifyTaskType('把这段话翻译成英文')).toBe('transformation')
  })

  it('把任务类型写进 meta，并标记离线模板来源', () => {
    const schema = composePrompt('用 TypeScript 写一个解析 CSV 的函数')
    expect(schema.meta.taskType).toBe('coding')
    expect(schema.meta.templateId).toBe('offline-heuristic-v1')
    expect(schema.meta.language).toBe('zh')
    expect(schema.meta.title.length).toBeGreaterThanOrEqual(2)
  })

  it('长文本自动进入改进模式', () => {
    const schema = composePrompt(`帮我优化这段文案：${'内容'.repeat(80)}`)
    expect(schema.meta.mode).toBe('improve')
    expect(composePrompt('帮我写个周报').meta.mode).toBe('generate')
  })

  it('生成可解释的假设清单，且来源为默认', () => {
    const schema = composePrompt('给产品评审会写一份议程')
    const paths = schema.assumptions.map((assumption) => assumption.path)
    expect(paths).toEqual([
      'output.language',
      'output.length',
      'context.audience',
      'output.format',
    ])
    for (const assumption of schema.assumptions) {
      expect(assumption.source).toBe('default')
      expect(assumption.value.length).toBeGreaterThan(0)
      expect(assumption.candidates.length).toBeGreaterThan(0)
    }
  })

  it('八字段的必填内容不是占位符', () => {
    const schema = composePrompt('从订单邮件里抽取订单号和金额')
    expect(schema.role.persona.length).toBeGreaterThan(4)
    expect(schema.objective.successCriteria.length).toBeGreaterThanOrEqual(1)
    expect(schema.context.background).toContain('订单邮件')
    expect(schema.constraints.boundaries.scopeIn.length).toBeGreaterThanOrEqual(1)
    expect(schema.constraints.boundaries.scopeOut.length).toBeGreaterThanOrEqual(1)
    expect(schema.constraints.boundaries.knowledgePolicy.length).toBeGreaterThan(0)
    expect(schema.constraints.boundaries.ambiguityPolicy.length).toBeGreaterThan(0)
    expect(schema.output.format).toBe('json')
    expect(schema.selfCheck.checklist.length).toBeGreaterThan(0)
    expect(schema.examples.negative.length).toBeGreaterThan(0)
  })

  it('离线模式不调用任何网络请求', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    composePrompt('帮我写个周报')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('清理零宽字符，但不静默截断原文', () => {
    const schema = composePrompt('帮我\u200b写一份周报')
    expect(schema.context.background).toContain('帮我写一份周报')
    expect(schema.context.background).not.toContain('\u200b')
    expect(schema.meta.title.length).toBeGreaterThanOrEqual(2)
  })

  it('用户写明的篇幅优先于场景模板默认值', () => {
    const schema = composePrompt('帮我写一篇面向普通读者的产品周报，1000 字左右')
    expect(schema.output.length).toBe('1000 字左右')
    expect(schema.constraints.boundaries.formatBoundary).toContain('1000 字左右')
    expect(
      schema.objective.successCriteria.some((item) => item.includes('1000 字左右')),
    ).toBe(true)
    // 模板默认值不能被同时写进文档，否则两条约束互相打架
    expect(JSON.stringify(schema)).not.toContain('400 到 800 字')
  })

  it('识别区间篇幅与「以内」句式', () => {
    expect(composePrompt('写一篇 600 到 900 字的说明').output.length).toBe(
      '600 到 900 字',
    )
    expect(composePrompt('写一份不超过 300 字的产品简介').output.length).toBe(
      '不超过 300 字',
    )
    expect(
      composePrompt('写一份不少于 2000 字的方案').output.length,
    ).toBe('至少 2000 字')
  })

  it('没写篇幅时仍用场景默认值', () => {
    const schema = composePrompt('帮我写篇周报')
    const length = schema.output.length ?? ''
    expect(length.length).toBeGreaterThan(0)
    expect(length).not.toContain('字左右')
  })

  it('受众抽取在「的」处收尾，不切成半个词', () => {
    const schema = composePrompt('帮我写一篇面向普通读者的产品周报')
    expect(schema.context.audience).toBe('普通读者')
    expect(
      schema.assumptions.find((item) => item.path === 'context.audience')?.value,
    ).toBe('普通读者')
  })

  it('空输入与超长输入明确报错', () => {
    expect(() => composePrompt('   ')).toThrow(ComposeInputError)
    expect(() => composePrompt('写')).toThrow(ComposeInputError)
    expect(() =>
      composePrompt('需'.repeat(MAX_REQUIREMENT_LENGTH + 1)),
    ).toThrow(ComposeInputError)
  })
})
