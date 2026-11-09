import { describe, expect, it } from 'vitest'
import { diagnose } from '@/lib/engine/lint/engine'
import { applyAllFixes, applyFix } from '@/lib/engine/lint/fix'
import type { LintIssue, LintRuleId } from '@/lib/engine/lint/types'
import { createLintFixture } from '@/tests/fixtures/lint/schemas'

function requireIssue(schema: ReturnType<typeof createLintFixture>, ruleId: LintRuleId): LintIssue {
  const issue = diagnose(schema).find((item) => item.ruleId === ruleId)
  if (issue === undefined) throw new Error(`期望 ${ruleId} 命中，但没有`)
  return issue
}

function hasRule(schema: ReturnType<typeof createLintFixture>, ruleId: LintRuleId): boolean {
  return diagnose(schema).some((issue) => issue.ruleId === ruleId)
}

describe('applyFix：可自动修复的规则', () => {
  it('R001 删除字段内所有命中，且不修改原 schema', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const snapshot = structuredClone(schema)
    const issue = requireIssue(schema, 'R001')

    const fixed = applyFix(schema, issue)

    expect(fixed).not.toBe(schema)
    expect(schema).toEqual(snapshot)
    expect(fixed.objective.goal).toBe('请简洁地给出结论')
    expect(hasRule(fixed, 'R001')).toBe(false)
  })

  it('R002 补默认格式与章节', () => {
    const schema = createLintFixture()
    schema.output.sections = []
    const issue = requireIssue(schema, 'R002')

    const fixed = applyFix(schema, issue)

    expect(fixed.output.sections.length).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R002')).toBe(false)
  })

  it('R003 补具体角色', () => {
    const schema = createLintFixture()
    schema.role.persona = '助手'
    const issue = requireIssue(schema, 'R003')

    const fixed = applyFix(schema, issue)

    expect(Array.from(fixed.role.persona).length).toBeGreaterThanOrEqual(6)
    expect(hasRule(fixed, 'R003')).toBe(false)
  })

  it('R004 补可核对的成功标准', () => {
    const schema = createLintFixture()
    schema.objective.successCriteria = ['待补充']
    const issue = requireIssue(schema, 'R004')

    const fixed = applyFix(schema, issue)

    expect(fixed.objective.successCriteria.length).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R004')).toBe(false)
  })

  it('R005 补「明确不做」清单', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.scopeOut = []
    const issue = requireIssue(schema, 'R005')

    const fixed = applyFix(schema, issue)

    expect(fixed.constraints.boundaries.scopeOut.length).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R005')).toBe(false)
  })

  it('R006 补知识不足策略', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.knowledgePolicy = ''
    const issue = requireIssue(schema, 'R006')

    const fixed = applyFix(schema, issue)

    expect(fixed.constraints.boundaries.knowledgePolicy.length).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R006')).toBe(false)
  })

  it('R007 补歧义处理策略', () => {
    const schema = createLintFixture()
    schema.constraints.boundaries.ambiguityPolicy = ''
    const issue = requireIssue(schema, 'R007')

    const fixed = applyFix(schema, issue)

    expect(fixed.constraints.boundaries.ambiguityPolicy.length).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R007')).toBe(false)
  })

  it('R009 把形容词换成可核对判据', () => {
    const schema = createLintFixture()
    schema.objective.goal = '输出一份专业的经营分析报告'
    const issue = requireIssue(schema, 'R009')

    const fixed = applyFix(schema, issue)

    expect(fixed.objective.goal).not.toContain('专业')
    expect(fixed.objective.goal).toContain('术语准确')
    expect(hasRule(fixed, 'R009')).toBe(false)
  })

  it('R010 补长度约束', () => {
    const schema = createLintFixture()
    schema.output.length = ''
    const issue = requireIssue(schema, 'R010')

    const fixed = applyFix(schema, issue)

    expect(fixed.output.length?.length ?? 0).toBeGreaterThan(0)
    expect(hasRule(fixed, 'R010')).toBe(false)
  })

  it('R011 自动补变量声明，且不会立刻触发 R012', () => {
    const schema = createLintFixture()
    schema.context.background += '；请围绕 {{topic}} 展开。'
    const issue = requireIssue(schema, 'R011')

    const fixed = applyFix(schema, issue)

    expect(fixed.input.variables.map((variable) => variable.name)).toContain('topic')
    expect(hasRule(fixed, 'R011')).toBe(false)
    expect(hasRule(fixed, 'R012')).toBe(false)
  })

  it('R012 删除未使用的变量声明', () => {
    const schema = createLintFixture()
    schema.input.variables.push({ name: 'topic', label: '主题', type: 'text', required: true })
    const issue = requireIssue(schema, 'R012')

    const fixed = applyFix(schema, issue)

    expect(fixed.input.variables).toHaveLength(0)
    expect(hasRule(fixed, 'R012')).toBe(false)
  })

  it('R016 按主题分组并保留全部条目', () => {
    const schema = createLintFixture()
    const items = [
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
    schema.constraints.must = [...items]
    const issue = requireIssue(schema, 'R016')

    const fixed = applyFix(schema, issue)

    expect(fixed.constraints.must).toHaveLength(items.length)
    expect(fixed.constraints.must.every((item) => /^【[^】]+】/.test(item))).toBe(true)
    for (const item of items) {
      expect(fixed.constraints.must.some((grouped) => grouped.includes(item))).toBe(true)
    }
    expect(hasRule(fixed, 'R016')).toBe(false)
  })
})

describe('applyFix：不可自动修复的规则', () => {
  it('R008 返回内容相同的新对象，不猜测用户意图', () => {
    const schema = createLintFixture()
    schema.constraints.must = ['尽可能详细地展开每个判断', '同时保持简洁']
    const issue = requireIssue(schema, 'R008')

    const fixed = applyFix(schema, issue)

    expect(fixed).not.toBe(schema)
    expect(fixed).toEqual(schema)
    expect(issue.fixable).toBe(false)
  })

  it('R013 / R014 不修改内容', () => {
    const schema = createLintFixture()
    schema.context.background = '它必须包含数据。'
    const r013 = requireIssue(schema, 'R013')
    expect(applyFix(schema, r013)).toEqual(schema)

    const longSchema = createLintFixture()
    const r014 = diagnose(longSchema, { estimateTokens: () => 5000 }).find(
      (issue) => issue.ruleId === 'R014',
    )
    if (r014 === undefined) throw new Error('期望 R014 命中')
    expect(applyFix(longSchema, r014)).toEqual(longSchema)
  })
})

describe('applyAllFixes', () => {
  it('一次修掉全部可自动修复项', () => {
    const schema = createLintFixture()
    // 不写「简洁」，否则会与基准样本里的「逐条」构成 R008 详略矛盾
    schema.objective.goal = '请尽量给出结论'
    schema.output.sections = []
    schema.output.length = ''

    const issues = diagnose(schema)
    const fixed = applyAllFixes(schema, issues)

    expect(fixed).not.toBe(schema)
    expect(diagnose(fixed)).toEqual([])
    // 原对象保持不变
    expect(schema.objective.goal).toBe('请尽量给出结论')
  })
})
