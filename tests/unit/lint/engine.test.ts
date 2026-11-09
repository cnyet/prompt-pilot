import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOKEN_ERROR_THRESHOLD,
  DEFAULT_TOKEN_WARN_THRESHOLD,
  createLintContext,
  diagnose,
  estimateTokens,
  lintSchema,
} from '@/lib/engine/lint/engine'
import { RULES } from '@/lib/engine/lint/rules'
import { createSkeletonSchema } from '@/lib/engine/schema'
import { lintLevelRank } from '@/lib/engine/lint/types'
import { countBodyChars, createLargeLintFixture, createLintFixture } from '@/tests/fixtures/lint/schemas'

describe('诊断引擎调度', () => {
  it('注册表包含 R001 到 R016 共 16 条规则', () => {
    expect(RULES.map((rule) => rule.id)).toEqual([
      'R001',
      'R002',
      'R003',
      'R004',
      'R005',
      'R006',
      'R007',
      'R008',
      'R009',
      'R010',
      'R011',
      'R012',
      'R013',
      'R014',
      'R015',
      'R016',
    ])
  })

  it('同一输入重复运行结果完全一致', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.output.sections = []

    expect(diagnose(schema)).toEqual(diagnose(schema))
  })

  it('诊断不修改入参', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.context.background += '；请围绕 {{topic}} 展开。'
    const snapshot = structuredClone(schema)

    diagnose(schema)

    expect(schema).toEqual(snapshot)
  })

  it('linter.suppressions 能过滤对应规则', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.linter.suppressions = ['R001']

    expect(diagnose(schema).some((issue) => issue.ruleId === 'R001')).toBe(false)
  })

  it('调用参数中的 suppressedRules 同样生效，且不影响其他规则', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.output.sections = []

    const issues = diagnose(schema, { suppressedRules: ['R001'] })
    expect(issues.some((issue) => issue.ruleId === 'R001')).toBe(false)
    expect(issues.some((issue) => issue.ruleId === 'R002')).toBe(true)
  })

  it('severityOverride 能把 warn 提升为 error', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.linter.severityOverride = { R001: 'error' }

    const issue = diagnose(schema).find((item) => item.ruleId === 'R001')
    expect(issue?.level).toBe('error')
    expect(issue?.fixable).toBe(true)
  })

  it('调用参数的级别覆盖优先于 schema 持久化配置', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.linter.severityOverride = { R001: 'info' }

    const issue = diagnose(schema, { severityOverride: { R001: 'error' } }).find(
      (item) => item.ruleId === 'R001',
    )
    expect(issue?.level).toBe('error')
  })

  it('非法的级别覆盖被忽略，保留规则默认级别', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.linter.severityOverride = { R001: 'fatal' }

    const issue = diagnose(schema).find((item) => item.ruleId === 'R001')
    expect(issue?.level).toBe('warn')
  })

  it('结果按 error → warn → info 排序', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    schema.output.sections = []
    schema.output.length = ''

    const issues = diagnose(schema)
    expect(issues.length).toBeGreaterThan(2)
    for (let i = 1; i < issues.length; i += 1) {
      const previous = issues[i - 1]
      const current = issues[i]
      expect(previous).toBeDefined()
      expect(current).toBeDefined()
      if (previous === undefined || current === undefined) continue
      expect(lintLevelRank(previous.level)).toBeLessThanOrEqual(lintLevelRank(current.level))
    }
  })

  it('lintSchema 是 diagnose 的别名', () => {
    expect(lintSchema).toBe(diagnose)
  })

  it('最小骨架不会抛错，缺「明确不做」与成功标准时报 error', () => {
    const skeleton = createSkeletonSchema('周报生成')
    const issues = diagnose(skeleton)

    expect(issues.some((issue) => issue.ruleId === 'R004' && issue.level === 'error')).toBe(true)
    expect(issues.some((issue) => issue.ruleId === 'R005' && issue.level === 'error')).toBe(true)
  })
})

describe('token 估算与 R014 阈值', () => {
  it('默认粗算：CJK 每字 1 token，其他 4 字符 1 token', () => {
    expect(estimateTokens('你好世界')).toBe(4)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('你好abcd')).toBe(3)
  })

  it('上下文包含渲染文本、字段列表与默认阈值', () => {
    const ctx = createLintContext(createLintFixture())
    expect(ctx.renderedText.length).toBeGreaterThan(0)
    expect(ctx.fields.length).toBeGreaterThan(0)
    expect(ctx.tokenWarnThreshold).toBe(DEFAULT_TOKEN_WARN_THRESHOLD)
    expect(ctx.tokenErrorThreshold).toBe(DEFAULT_TOKEN_ERROR_THRESHOLD)
  })

  it('阈值可被调用参数覆盖', () => {
    const schema = createLintFixture()

    const warnIssue = diagnose(schema, { tokenWarnThreshold: 1 }).find(
      (issue) => issue.ruleId === 'R014',
    )
    expect(warnIssue?.level).toBe('warn')

    const errorIssue = diagnose(schema, { tokenWarnThreshold: 1, tokenErrorThreshold: 1 }).find(
      (issue) => issue.ruleId === 'R014',
    )
    expect(errorIssue?.level).toBe('error')
  })

  it('自定义 estimateTokens 会参与诊断', () => {
    const schema = createLintFixture()
    const issue = diagnose(schema, { estimateTokens: () => 5000 }).find(
      (item) => item.ruleId === 'R014',
    )
    expect(issue?.level).toBe('error')
  })
})

describe('性能：4000 字全量诊断', () => {
  it('单次全量诊断小于 50ms', () => {
    const schema = createLargeLintFixture(4000)
    const chars = countBodyChars(schema)
    expect(chars).toBeGreaterThanOrEqual(4000)

    // 预热，排除首次 JIT 与模块懒加载的影响
    diagnose(schema)

    const durations: number[] = []
    let issueCount = 0
    for (let i = 0; i < 5; i += 1) {
      const startedAt = performance.now()
      const issues = diagnose(schema)
      durations.push(performance.now() - startedAt)
      issueCount = issues.length
    }

    const max = Math.max(...durations)
    const median = [...durations].sort((left, right) => left - right)[2] ?? 0
    // 性能数字写进测试日志，便于验收时记录
    console.log(
      `[lint perf] body=${chars} chars, issues=${issueCount}, median=${median.toFixed(2)}ms, max=${max.toFixed(2)}ms`,
    )

    expect(issueCount).toBeGreaterThan(0)
    expect(diagnose(schema).some((issue) => issue.ruleId === 'R014')).toBe(true)
    expect(max).toBeLessThan(50)
  })
})
