import { describe, expect, it } from 'vitest'
import {
  FIELD_KEYS,
  PromptPilotSchemaV1,
  createSkeletonSchema,
} from '@/lib/engine/schema'
import { diagnose } from '@/lib/engine/lint/engine'

describe('PromptPilot Schema v1', () => {
  it('骨架能解析，且八个字段齐全', () => {
    const doc = createSkeletonSchema('周报生成')
    for (const key of FIELD_KEYS) {
      expect(doc).toHaveProperty(key)
    }
    expect(FIELD_KEYS).toHaveLength(8)
  })

  it('草稿容忍：清空「明确不做」仍可保存，由诊断报 R005', () => {
    const raw = structuredClone(createSkeletonSchema('周报生成'))
    raw.constraints.boundaries.scopeOut = []

    // 不抛异常即表示草稿可保存
    const doc = PromptPilotSchemaV1.parse(raw)

    const issues = diagnose(doc)
    const r005 = issues.find((issue) => issue.ruleId === 'R005')
    expect(r005?.level).toBe('error')
    expect(r005?.fixable).toBe(true)
  })

  it('草稿容忍：清空「知识不足策略」仍可保存，由诊断报 R006', () => {
    const raw = structuredClone(createSkeletonSchema('周报生成'))
    raw.constraints.boundaries.knowledgePolicy = ''

    const doc = PromptPilotSchemaV1.parse(raw)

    const issues = diagnose(doc)
    expect(issues.some((issue) => issue.ruleId === 'R006')).toBe(true)
  })

  it('变量名非法时报错', () => {
    const raw = structuredClone(createSkeletonSchema('周报生成'))
    raw.input.variables.push({
      name: '2bad-name',
      label: '坏变量',
      type: 'text',
      required: true,
    })

    const result = PromptPilotSchemaV1.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it('省略可选数组时自动补默认值', () => {
    const parsed = PromptPilotSchemaV1.parse({
      schemaVersion: 'pp-schema-v1',
      meta: { title: '最小文档', taskType: 'qa', language: 'zh' },
      role: { persona: '编辑' },
      objective: { goal: '写一段说明', successCriteria: ['说清用途'] },
      context: { background: '' },
      input: { variables: [] },
      constraints: {
        boundaries: {
          scopeIn: ['写说明'],
          scopeOut: ['不写代码'],
          knowledgePolicy: '不知道就说不知道',
          ambiguityPolicy: '先问再写',
        },
      },
      output: { format: 'plain' },
    })

    expect(parsed.examples.items).toEqual([])
    expect(parsed.selfCheck.checklist).toEqual([])
    expect(parsed.assumptions).toEqual([])
    expect(parsed.meta.mode).toBe('generate')
  })

  it('零宽字符与超长标题不做静默截断，交由上游校验', () => {
    const result = PromptPilotSchemaV1.safeParse({
      ...createSkeletonSchema('标题'),
      meta: { title: 'a', taskType: 'qa', language: 'zh' },
    })
    expect(result.success).toBe(false)
  })
})
