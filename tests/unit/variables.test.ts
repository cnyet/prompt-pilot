import { describe, expect, it } from 'vitest'
import type { PromptVariable } from '@/lib/engine/schema'
import {
  defaultVariableValue,
  deriveVariableFields,
  displayVariableValue,
  extractVariableNames,
  initialVariableValues,
  issuesToMap,
  serializeVariableValues,
  substituteVariables,
  validateVariableValues,
} from '@/lib/engine/variables'

const VARIABLES: PromptVariable[] = [
  { name: 'topic', label: '主题', type: 'text', required: true },
  {
    name: 'detail',
    label: '补充说明',
    type: 'longtext',
    required: false,
    defaultValue: '默认说明',
    description: '可以留空',
  },
  { name: 'count', label: '条数', type: 'number', required: true },
  {
    name: 'tone',
    label: '语气',
    type: 'enum',
    required: true,
    options: ['正式', '简洁'],
    defaultValue: '简洁',
  },
  { name: 'meta', label: '元数据', type: 'json', required: false },
  {
    name: 'strict',
    label: '严格模式',
    type: 'boolean',
    required: false,
    defaultValue: 'true',
  },
]

const FIELDS = deriveVariableFields(VARIABLES)

describe('从 schema 派生变量表单', () => {
  it('六种类型分别映射到下拉、多行、数字输入与开关', () => {
    expect(FIELDS.map((field) => field.control)).toEqual([
      'text',
      'textarea',
      'number',
      'select',
      'textarea',
      'switch',
    ])
    expect(FIELDS[3]?.options).toEqual(['正式', '简洁'])
    expect(FIELDS[1]?.description).toBe('可以留空')
    expect(FIELDS[1]?.required).toBe(false)
  })

  it('默认值按类型归一：布尔转 true / false，非法枚举退回空值', () => {
    const [topic, detail, , tone, , strict] = FIELDS
    if (!topic || !detail || !tone || !strict) {
      throw new Error('字段缺失')
    }
    expect(defaultVariableValue(topic)).toBe('')
    expect(defaultVariableValue(detail)).toBe('默认说明')
    expect(defaultVariableValue(tone)).toBe('简洁')
    expect(defaultVariableValue(strict)).toBe('true')

    const invalidEnum = deriveVariableFields([
      {
        name: 'tone',
        label: '语气',
        type: 'enum',
        required: true,
        options: ['正式', '简洁'],
        defaultValue: '不存在',
      },
    ])[0]
    if (!invalidEnum) {
      throw new Error('字段缺失')
    }
    expect(defaultVariableValue(invalidEnum)).toBe('')
  })

  it('初始值覆盖全部声明变量，布尔默认是关闭', () => {
    const values = initialVariableValues(FIELDS)
    expect(values).toEqual({
      topic: '',
      detail: '默认说明',
      count: '',
      tone: '简洁',
      meta: '',
      strict: 'true',
    })
  })
})

describe('必填与类型校验', () => {
  it('必填变量为空时给出可定位的提示', () => {
    const issues = validateVariableValues(FIELDS, {
      topic: '   ',
      detail: '',
      count: '',
      tone: '',
      meta: '',
      strict: 'false',
    })
    expect(issues.map((issue) => issue.name)).toEqual(['topic', 'count', 'tone'])
    expect(issues[0]?.message).toContain('主题')
    expect(issues[0]?.message).toContain('填写')
    expect(issuesToMap(issues).topic).toBe(issues[0]?.message)
  })

  it('可选变量留空合法，布尔始终有值', () => {
    const issues = validateVariableValues(FIELDS, {
      topic: '秋季新品',
      detail: '',
      count: '3',
      tone: '正式',
      meta: '',
      strict: 'false',
    })
    expect(issues).toEqual([])
  })

  it('数字、JSON、枚举与布尔都按类型校验', () => {
    const base = {
      topic: '秋季新品',
      detail: '',
      count: '3',
      tone: '正式',
      meta: '{}',
      strict: 'false',
    }
    expect(validateVariableValues(FIELDS, { ...base, count: '三条' })[0]?.name).toBe(
      'count',
    )
    expect(validateVariableValues(FIELDS, { ...base, meta: '{oops' })[0]?.name).toBe(
      'meta',
    )
    expect(validateVariableValues(FIELDS, { ...base, tone: '随意' })[0]?.name).toBe(
      'tone',
    )
    expect(
      validateVariableValues(FIELDS, { ...base, strict: 'maybe' })[0]?.name,
    ).toBe('strict')
    expect(validateVariableValues(FIELDS, { ...base, count: '3.5' })).toEqual([])
  })
})

describe('变量替换与快照', () => {
  it('替换所有占位符，布尔转成是 / 否，可选空值变空串', () => {
    const template =
      '主题：{{topic}}\n语气：{{tone}}\n严格：{{strict}}\n补充：{{detail}}\n再次：{{topic}}'
    const text = substituteVariables(template, FIELDS, {
      topic: '秋季新品',
      detail: '',
      count: '3',
      tone: '正式',
      meta: '',
      strict: 'true',
    })
    expect(text).toContain('主题：秋季新品')
    expect(text).toContain('语气：正式')
    expect(text).toContain('严格：是')
    expect(text).toContain('补充：\n')
    expect(text.match(/秋季新品/g)).toHaveLength(2)
    expect(displayVariableValue(FIELDS[5]!, 'false')).toBe('否')
  })

  it('未知占位符保持原样，变量名提取只认合法标识符', () => {
    const template = '{{topic}} {{ missing }} {{1bad}}'
    expect(
      substituteVariables(template, FIELDS, {
        topic: '秋季新品',
        detail: '',
        count: '3',
        tone: '正式',
        meta: '',
        strict: 'false',
      }),
    ).toBe('秋季新品 {{ missing }} {{1bad}}')
    expect(extractVariableNames(template)).toEqual(['topic', 'missing'])
  })

  it('落库快照只包含当前声明的变量', () => {
    const json = serializeVariableValues(FIELDS, {
      topic: '秋季新品',
      detail: '',
      count: '3',
      tone: '正式',
      meta: '{}',
      strict: 'true',
      legacy: '旧变量',
    })
    expect(JSON.parse(json)).toEqual({
      topic: '秋季新品',
      detail: '',
      count: '3',
      tone: '正式',
      meta: '{}',
      strict: 'true',
    })
  })
})
