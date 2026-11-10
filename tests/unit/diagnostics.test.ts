import { describe, expect, it } from 'vitest'
import { diagnose } from '@/lib/engine/lint/engine'
import type { LintIssue } from '@/lib/engine/lint/engine'
import { renderFieldText } from '@/lib/engine/render'
import { createLintFixture } from '@/tests/fixtures/lint/schemas'
import {
  DIAGNOSTICS_DEBOUNCE_MS,
  LINT_LEVEL_TEXT_CLASS,
  buildIssueExcerpt,
  formatIssueLocation,
  groupIssues,
  issueField,
  issueIgnoreKey,
  parseIgnoredKeys,
  resolveIssueSelection,
  serializeIgnoredKeys,
  summarizeIssues,
  visibleIssues,
} from '@/components/studio/useDiagnostics'

function makeIssue(
  overrides: Partial<LintIssue> & Pick<LintIssue, 'ruleId' | 'level' | 'path'>,
): LintIssue {
  return {
    message: '问题描述',
    why: '为什么是问题',
    suggestion: '修复建议',
    fixable: true,
    ...overrides,
  }
}

function fuzzyIssue(): LintIssue {
  const schema = createLintFixture()
  schema.objective.goal = '请尽量简洁地给出结论'
  const issue = diagnose(schema).find((item) => item.ruleId === 'R001')
  if (issue === undefined) {
    throw new Error('期望 fixture 命中 R001')
  }
  return issue
}

describe('诊断分组与计数', () => {
  it('输入防抖为 150 毫秒，与架构约定一致', () => {
    expect(DIAGNOSTICS_DEBOUNCE_MS).toBe(150)
  })

  it('按 error、warn、info 分组且保持组内原顺序', () => {
    const issues = [
      makeIssue({ ruleId: 'R002', level: 'error', path: 'output.format' }),
      makeIssue({ ruleId: 'R001', level: 'warn', path: 'objective.goal' }),
      makeIssue({ ruleId: 'R010', level: 'info', path: 'output.length' }),
      makeIssue({ ruleId: 'R005', level: 'error', path: 'constraints.boundaries.scopeOut' }),
    ]

    const groups = groupIssues(issues)

    expect(groups.error.map((issue) => issue.ruleId)).toEqual(['R002', 'R005'])
    expect(groups.warn.map((issue) => issue.ruleId)).toEqual(['R001'])
    expect(groups.info.map((issue) => issue.ruleId)).toEqual(['R010'])
  })

  it('汇总计数并标出是否存在 error', () => {
    const issues = [
      makeIssue({ ruleId: 'R002', level: 'error', path: 'output.format' }),
      makeIssue({ ruleId: 'R001', level: 'warn', path: 'objective.goal' }),
      makeIssue({ ruleId: 'R010', level: 'info', path: 'output.length' }),
      makeIssue({ ruleId: 'R001', level: 'warn', path: 'role.persona' }),
    ]

    expect(summarizeIssues(issues)).toEqual({
      error: 1,
      warn: 2,
      info: 1,
      total: 4,
      hasError: true,
    })
    expect(summarizeIssues([]).hasError).toBe(false)
    expect(summarizeIssues([]).total).toBe(0)
  })

  it('级别配色只用 danger、warning 与 ink-muted 三个令牌', () => {
    expect(LINT_LEVEL_TEXT_CLASS).toEqual({
      error: 'text-danger',
      warn: 'text-warning',
      info: 'text-ink-muted',
    })
  })
})

describe('问题定位', () => {
  it('区分字段级问题与文档级问题', () => {
    expect(issueField(makeIssue({ ruleId: 'R005', level: 'error', path: 'constraints.boundaries.scopeOut' }))).toBe(
      'constraints',
    )
    expect(issueField(makeIssue({ ruleId: 'R011', level: 'error', path: 'input.variables[0]' }))).toBe(
      'input',
    )
    expect(issueField(makeIssue({ ruleId: 'R014', level: 'warn', path: '$' }))).toBeNull()
  })

  it('位置文案由字段名与叶子名组成，文档级问题显示整篇文档', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const fieldText = renderFieldText(schema, 'objective')
    const issue = fuzzyIssue()

    expect(formatIssueLocation(issue, fieldText)).toBe('目标')
    expect(formatIssueLocation(issue)).toBe('目标')
    expect(
      formatIssueLocation(
        makeIssue({ ruleId: 'R014', level: 'warn', path: '$' }),
      ),
    ).toBe('整篇文档')
    expect(
      formatIssueLocation(
        makeIssue({ ruleId: 'R001', level: 'warn', path: 'meta.title' }),
      ),
    ).toBe('标题')
    expect(
      formatIssueLocation(
        makeIssue({ ruleId: 'R011', level: 'error', path: 'input.variables[0]' }),
      ),
    ).toBe('输入与变量 · 变量')
  })

  it('把叶子内区间换算成字段文本的绝对区间', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const fieldText = renderFieldText(schema, 'objective')
    const issue = fuzzyIssue()

    const selection = resolveIssueSelection(issue, fieldText)

    expect(selection).not.toBeNull()
    if (selection === null) return
    expect(fieldText.slice(selection.start, selection.end)).toBe('尽量')
    expect(selection.start).toBe(fieldText.indexOf('尽量'))
    expect(selection.end).toBe(selection.start + 2)
  })

  it('没有 span 或叶子不存在时不返回选区', () => {
    expect(resolveIssueSelection(fuzzyIssue(), '')).toBeNull()
    expect(
      resolveIssueSelection(
        makeIssue({ ruleId: 'R002', level: 'error', path: 'output.format' }),
        '格式：Markdown',
      ),
    ).toBeNull()
  })

  it('高亮片段带命中词与上下文，且把换行压成空格', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const fieldText = `${renderFieldText(schema, 'objective')}\n补充行`
    const excerpt = buildIssueExcerpt(fuzzyIssue(), fieldText)

    expect(excerpt).not.toBeNull()
    expect(excerpt?.match).toBe('尽量')
    expect(excerpt?.before).toContain('目标：请')
    expect(excerpt?.after).toContain('简洁地给出结论')
    expect(excerpt?.before).not.toContain('\n')
  })
})

describe('忽略状态', () => {
  it('忽略键不随文本偏移与措辞变化，只随规则、路径与命中词变化', () => {
    const first = makeIssue({
      ruleId: 'R001',
      level: 'warn',
      path: 'objective.goal',
      span: [2, 4],
      message: '第一次措辞',
      data: { word: '尽量', replacement: '' },
    })
    const second = makeIssue({
      ruleId: 'R001',
      level: 'warn',
      path: 'objective.goal',
      span: [9, 11],
      message: '改字后的另一种措辞',
      data: { word: '尽量', replacement: '' },
    })
    const otherWord = makeIssue({
      ruleId: 'R001',
      level: 'warn',
      path: 'objective.goal',
      span: [2, 4],
      message: '第一次措辞',
      data: { word: '适当', replacement: '' },
    })

    expect(issueIgnoreKey(first)).toBe(issueIgnoreKey(second))
    expect(issueIgnoreKey(first)).not.toBe(issueIgnoreKey(otherWord))
  })

  it('同一路径下不同规则与不同轴分别记住', () => {
    const detail = makeIssue({
      ruleId: 'R008',
      level: 'error',
      path: 'constraints.must[0]',
      data: { axis: 'detail' },
    })
    const length = makeIssue({
      ruleId: 'R008',
      level: 'error',
      path: 'constraints.must[0]',
      data: { axis: 'length' },
    })

    expect(issueIgnoreKey(detail)).not.toBe(issueIgnoreKey(length))
  })

  it('忽略列表只过滤命中键，其余问题原样保留', () => {
    const ignoredIssue = makeIssue({
      ruleId: 'R001',
      level: 'warn',
      path: 'objective.goal',
      data: { word: '尽量' },
    })
    const issues = [
      ignoredIssue,
      makeIssue({ ruleId: 'R001', level: 'warn', path: 'role.persona', data: { word: '尽量' } }),
      makeIssue({ ruleId: 'R005', level: 'error', path: 'constraints.boundaries.scopeOut' }),
    ]
    const ignored = new Set([issueIgnoreKey(ignoredIssue)])

    const visible = visibleIssues(issues, ignored)

    expect(visible).toHaveLength(2)
    expect(visible.some((issue) => issue.path === 'objective.goal')).toBe(false)
    expect(visible.some((issue) => issue.path === 'role.persona')).toBe(true)
  })

  it('忽略列表能序列化、反序列化并容忍脏数据', () => {
    const keys = new Set(['R001|objective.goal|尽量', 'R005|constraints.boundaries.scopeOut|'])

    expect(new Set(parseIgnoredKeys(serializeIgnoredKeys(keys)))).toEqual(keys)
    expect(parseIgnoredKeys(null)).toEqual([])
    expect(parseIgnoredKeys('')).toEqual([])
    expect(parseIgnoredKeys('not json')).toEqual([])
    expect(parseIgnoredKeys('{"a":1}')).toEqual([])
    expect(parseIgnoredKeys('["ok", 3, "", null]')).toEqual(['ok'])
  })
})
