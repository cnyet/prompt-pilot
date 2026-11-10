import { describe, expect, it } from 'vitest'
import {
  applyFix,
  diagnose,
  type LintIssue,
} from '@/lib/engine/lint/engine'
import {
  FIELD_KEYS,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import { buildSchemaFromFields } from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import { createLintFixture } from '@/tests/fixtures/lint/schemas'
import {
  changedFieldWrites,
  issueIgnoreKey,
  planAllFixes,
  planSingleFix,
  visibleIssues,
  type FieldWrite,
} from '@/components/studio/useDiagnostics'

function requireIssue(schema: PromptSchema, ruleId: LintIssue['ruleId']): LintIssue {
  const issue = diagnose(schema).find((item) => item.ruleId === ruleId)
  if (issue === undefined) {
    throw new Error(`期望命中 ${ruleId}`)
  }
  return issue
}

function makeIssue(
  overrides: Partial<LintIssue> & Pick<LintIssue, 'ruleId' | 'level' | 'path'>,
): LintIssue {
  return {
    message: '问题描述',
    why: '为什么是问题',
    suggestion: '修复建议',
    fixable: false,
    ...overrides,
  }
}

function fieldTextsOf(schema: PromptSchema): Partial<Record<FieldKey, string>> {
  const texts: Partial<Record<FieldKey, string>> = {}
  for (const field of FIELD_KEYS) {
    texts[field] = renderFieldText(schema, field)
  }
  return texts
}

function applyWrites(
  texts: Partial<Record<FieldKey, string>>,
  writes: readonly FieldWrite[],
): Partial<Record<FieldKey, string>> {
  const next = { ...texts }
  for (const write of writes) {
    next[write.field] = write.text
  }
  return next
}

/** 模拟界面写回：字段文本先写回，再由字段文本重建 schema 供下一轮诊断。 */
function schemaAfterWrites(
  schema: PromptSchema,
  writes: readonly FieldWrite[],
): PromptSchema {
  const texts = applyWrites(fieldTextsOf(schema), writes)
  return buildSchemaFromFields(texts, {
    title: schema.meta.title,
    taskType: schema.meta.taskType,
    language: schema.meta.language,
    templateId: schema.meta.templateId,
  })
}

function hasRule(schema: PromptSchema, ruleId: LintIssue['ruleId']): boolean {
  return diagnose(schema).some((issue) => issue.ruleId === ruleId)
}

function fuzzyAndBoundaryFixture(): PromptSchema {
  const schema = createLintFixture()
  schema.objective.goal = '请尽量简洁地给出结论'
  schema.constraints.boundaries.scopeOut = []
  return schema
}

describe('单项修复', () => {
  it('非手改字段直接给出写入，且只改目标字段', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const issue = requireIssue(schema, 'R001')

    const plan = planSingleFix(schema, issue, new Set())

    expect(plan.kind).toBe('apply')
    expect(plan.writes).toHaveLength(1)
    const [write] = plan.writes
    expect(write?.field).toBe('objective')
    expect(write?.text).toContain('请简洁')
    expect(write?.text).not.toContain('尽量')
  })

  it('对手改字段返回二次确认，不确认就不写回', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const issue = requireIssue(schema, 'R001')

    const plan = planSingleFix(schema, issue, new Set<FieldKey>(['objective']))

    expect(plan.kind).toBe('needs-confirmation')
    expect(plan.field).toBe('objective')
    expect(plan.writes.every((write) => write.field === 'objective')).toBe(true)
  })

  it('确认后只重写目标字段并让对应问题消失', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const issue = requireIssue(schema, 'R001')
    const plan = planSingleFix(schema, issue, new Set<FieldKey>(['objective']))

    const fixed = schemaAfterWrites(schema, plan.writes)

    expect(renderFieldText(fixed, 'objective')).not.toContain('尽量')
    expect(hasRule(fixed, 'R001')).toBe(false)
    expect(renderFieldText(fixed, 'role')).toBe(
      renderFieldText(schema, 'role'),
    )
  })

  it('不可修复问题返回 nothing，且不产生任何写入', () => {
    const schema = createLintFixture()
    const issue = makeIssue({
      ruleId: 'R008',
      level: 'error',
      path: 'constraints.must[0]',
      fixable: false,
    })

    const plan = planSingleFix(schema, issue, new Set())

    expect(plan.kind).toBe('nothing')
    expect(plan.writes).toEqual([])
  })

  it('八字段之外的问题（标题）不产生写入', () => {
    const schema = createLintFixture()
    schema.meta.title = '请尽量简洁的周报'
    const issue = makeIssue({
      ruleId: 'R001',
      level: 'warn',
      path: 'meta.title',
      fixable: true,
      data: { word: '尽量', replacement: '' },
    })

    const plan = planSingleFix(schema, issue, new Set())

    expect(plan.kind).toBe('nothing')
    expect(plan.writes).toEqual([])
  })

  it('修复前后对比只返回渲染文本真的变化的字段', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const issue = requireIssue(schema, 'R001')

    const writes = changedFieldWrites(schema, applyFix(schema, issue))

    expect(writes.map((write) => write.field)).toEqual(['objective'])
  })
})

describe('批量修复', () => {
  it('跳过用户手改过的字段，其余字段照常修复', () => {
    const schema = fuzzyAndBoundaryFixture()
    const plan = planAllFixes(
      schema,
      diagnose(schema),
      new Set<FieldKey>(['objective']),
    )

    expect(plan.skippedFields).toEqual(['objective'])
    expect(plan.writes.some((write) => write.field === 'objective')).toBe(false)
    const constraintWrite = plan.writes.find(
      (write) => write.field === 'constraints',
    )
    expect(constraintWrite?.text).toContain('不把推测当作结论呈现')
  })

  it('手改字段里的问题保留，修复后再次诊断仍能报出', () => {
    const schema = fuzzyAndBoundaryFixture()
    const plan = planAllFixes(
      schema,
      diagnose(schema),
      new Set<FieldKey>(['objective']),
    )

    const fixed = schemaAfterWrites(schema, plan.writes)
    const remaining = diagnose(fixed)

    expect(remaining.some((issue) => issue.ruleId === 'R005')).toBe(false)
    expect(remaining.some((issue) => issue.ruleId === 'R001')).toBe(true)
    expect(renderFieldText(fixed, 'objective')).toContain('尽量')
  })

  it('全部字段都手改时没有写入，只报告被跳过的字段', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const plan = planAllFixes(
      schema,
      diagnose(schema),
      new Set<FieldKey>(['objective']),
    )

    expect(plan.writes).toEqual([])
    expect(plan.skippedFields).toEqual(['objective'])
    expect(plan.fixedIssueKeys).toEqual([])
  })

  it('不可修复问题不参与批量写入', () => {
    const schema = createLintFixture()
    schema.objective.goal = '请尽量简洁地给出结论'
    const unfixable = makeIssue({
      ruleId: 'R008',
      level: 'error',
      path: 'constraints.must[0]',
      fixable: false,
    })
    const plan = planAllFixes(
      schema,
      [...diagnose(schema), unfixable],
      new Set(),
    )

    expect(plan.fixedIssueKeys).not.toContain(issueIgnoreKey(unfixable))
    expect(plan.writes.every((write) => write.field !== 'constraints')).toBe(true)
  })

  it('全部修复后可修复问题消失，计数随之下降', () => {
    const schema = fuzzyAndBoundaryFixture()
    const before = diagnose(schema)
    const plan = planAllFixes(schema, before, new Set())

    expect(plan.writes.length).toBeGreaterThan(0)
    expect(plan.fixedIssueKeys.length).toBeGreaterThan(0)

    const fixed = schemaAfterWrites(schema, plan.writes)
    const after = diagnose(fixed)

    expect(after.length).toBeLessThan(before.length)
    expect(after.some((issue) => issue.ruleId === 'R001')).toBe(false)
    expect(after.some((issue) => issue.ruleId === 'R005')).toBe(false)
  })
})

describe('忽略与诊断的联动', () => {
  it('忽略一条问题后其余问题与计数都不受影响', () => {
    const schema = fuzzyAndBoundaryFixture()
    const issues = diagnose(schema)
    const target = requireIssue(schema, 'R001')
    const ignoredKeys = new Set([issueIgnoreKey(target)])

    const visible = visibleIssues(issues, ignoredKeys)

    expect(visible.some((issue) => issue.ruleId === 'R001')).toBe(false)
    expect(visible.some((issue) => issue.ruleId === 'R005')).toBe(true)
    expect(visible.length).toBe(issues.length - 1)
  })
})
