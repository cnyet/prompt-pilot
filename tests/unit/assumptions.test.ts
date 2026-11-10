import { describe, expect, it } from 'vitest'
import {
  ASSUMPTION_DEFINITIONS,
  assumptionFieldOf,
  buildAssumptionChips,
  buildExportAssumptions,
  captureAssumptionBaseline,
  isAssumptionPath,
  mergeAssumptions,
  upsertAssumption,
  writeAssumptionValue,
} from '@/lib/engine/assumptions'
import { composePrompt } from '@/lib/engine/compose'
import {
  extractLeaves,
  fieldKeyOfPath,
  replaceLeafValue,
} from '@/lib/engine/paths'
import { FORMAT_LABELS, renderFieldText } from '@/lib/engine/render'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'

const requirement =
  '帮我写一份产品需求评审周报，给业务负责人看，输出 Markdown，800 字左右'
const schema = composePrompt(requirement)

function allFieldTexts(): Record<FieldKey, string> {
  return Object.fromEntries(
    FIELD_KEYS.map((field) => [field, renderFieldText(schema, field)] as const),
  ) as Record<FieldKey, string>
}

function chipFor(path: string) {
  const chip = buildAssumptionChips({
    fields: allFieldTexts(),
    assumptions: schema.assumptions,
  }).find((candidate) => candidate.path === path)
  if (!chip) {
    throw new Error(`没有找到假设 chip：${path}`)
  }
  return chip
}

describe('五条假设路径与重算目标字段', () => {
  it('覆盖 output.language / length / format / context.audience / output.tone', () => {
    expect(ASSUMPTION_DEFINITIONS.map((definition) => definition.path)).toEqual(
      [
        'output.language',
        'output.length',
        'output.format',
        'context.audience',
        'output.tone',
      ],
    )
    for (const definition of ASSUMPTION_DEFINITIONS) {
      expect(isAssumptionPath(definition.path)).toBe(true)
      expect(definition.targetField).toBe(fieldKeyOfPath(definition.path))
      expect(assumptionFieldOf(definition.path)).toBe(definition.targetField)
      expect(definition.candidates.length).toBeGreaterThan(0)
    }
  })

  it('字段里缺少 tone 假设时，用字段文本读出当前语气并补齐第五条 chip', () => {
    const chips = buildAssumptionChips({
      fields: allFieldTexts(),
      assumptions: schema.assumptions,
    })

    expect(chips).toHaveLength(5)
    const tone = chips.find((chip) => chip.path === 'output.tone')
    expect(tone?.value).toBe(schema.output.tone)
    expect(tone?.present).toBe(true)
    expect(tone?.applicable).toBe(true)
    expect(tone?.source).toBe('inferred')
    expect(
      schema.assumptions.some(
        (assumption) => assumption.path === 'output.tone',
      ),
    ).toBe(false)
  })

  it('当前值优先读字段叶子，模型候选与默认候选合并去重', () => {
    const fields = allFieldTexts()
    const chips = buildAssumptionChips({
      fields: { ...fields, output: '格式：Markdown\n语言：英文' },
      assumptions: schema.assumptions,
    })
    const language = chips.find((chip) => chip.path === 'output.language')

    expect(language?.value).toBe('英文')
    expect(language?.candidates[0]).toBe('英文')
    expect(language?.candidates).toContain('中文')
    expect(new Set(language?.candidates).size).toBe(
      language?.candidates.length,
    )
  })

  it('「已改」由当前值与生成基线派生，未改与已改各归各位', () => {
    const fields = allFieldTexts()
    const baseline = captureAssumptionBaseline(fields, schema.assumptions)

    expect(Object.keys(baseline).sort()).toEqual(
      ASSUMPTION_DEFINITIONS.map((definition) => definition.path).sort(),
    )
    const unchanged = buildAssumptionChips({
      fields,
      assumptions: schema.assumptions,
      baselineValues: baseline,
    })
    expect(unchanged.every((chip) => !chip.modified)).toBe(true)
    expect(unchanged.every((chip) => chip.source !== 'user')).toBe(true)

    const write = writeAssumptionValue(fields, 'output.language', '英文')
    if (!write.ok) {
      throw new Error(`写入被拒绝：${write.reason}`)
    }
    const changed = buildAssumptionChips({
      fields: { ...fields, [write.field]: write.text },
      assumptions: schema.assumptions,
      baselineValues: baseline,
    })

    expect(
      changed.filter((chip) => chip.modified).map((chip) => chip.path),
    ).toEqual(['output.language'])
    expect(
      changed.find((chip) => chip.path === 'output.language')?.source,
    ).toBe('user')
    expect(
      changed.find((chip) => chip.path === 'output.length')?.source,
    ).not.toBe('user')
  })

  it('单字段重试的基线只刷新指定字段，其余路径保留旧值', () => {
    const baseline = captureAssumptionBaseline(
      allFieldTexts(),
      schema.assumptions,
      ['context'],
    )

    expect(Object.keys(baseline)).toEqual(['context.audience'])
  })
})

describe('只改受影响的字段与叶子', () => {
  it('改 output.language 只替换 output 字段的语言叶子，其余字段逐字不变', () => {
    const before = allFieldTexts()
    const write = writeAssumptionValue(before, 'output.language', '英文')

    expect(write.ok).toBe(true)
    if (!write.ok) {
      throw new Error(`写入被拒绝：${write.reason}`)
    }
    expect(write.field).toBe('output')
    expect(write.mode).toBe('leaf')

    const expected = replaceLeafValue(
      'output',
      before.output,
      'output.language',
      '英文',
    )
    expect(write.text).toBe(expected.text)

    const after: Record<FieldKey, string> = {
      ...before,
      [write.field]: write.text,
    }
    for (const field of FIELD_KEYS) {
      if (field === write.field) {
        continue
      }
      expect(after[field], field).toBe(before[field])
    }

    const beforeLeaves = extractLeaves('output', before.output)
    const afterLeaves = extractLeaves('output', write.text)
    for (const leaf of beforeLeaves) {
      if (leaf.path === 'output.language') {
        continue
      }
      expect(
        afterLeaves.find((candidate) => candidate.path === leaf.path)?.value,
        leaf.path,
      ).toBe(leaf.value)
    }
  })

  it('改 context.audience 不动 output、role 等另外七个字段', () => {
    const before = allFieldTexts()
    const write = writeAssumptionValue(before, 'context.audience', '团队成员')

    expect(write).toMatchObject({ ok: true, field: 'context', mode: 'leaf' })
    if (!write.ok) {
      throw new Error('写入被拒绝')
    }
    const after: Record<FieldKey, string> = {
      ...before,
      [write.field]: write.text,
    }
    for (const field of FIELD_KEYS) {
      if (field === 'context') {
        continue
      }
      expect(after[field], field).toBe(before[field])
    }
  })

  it('跨行叶子的续行在手写内容后仍然保留（工单 16 写回路径）', () => {
    const text = [
      '格式：Markdown',
      '语言：中文',
      '这一行没有标签，是我手写的补充。',
    ].join('\n')
    const write = writeAssumptionValue({ output: text }, 'output.language', '英文')

    expect(write.ok).toBe(true)
    if (!write.ok) {
      throw new Error('写入被拒绝')
    }
    expect(write.text).toContain('语言：英文')
    expect(write.text).not.toContain('语言：中文')
    expect(write.text).toContain('这一行没有标签，是我手写的补充。')
    expect(write.text.split('\n')).toHaveLength(3)
  })

  it('字段缺少目标行时只在规范文本上补一行，已有标签行全部保留', () => {
    const text = [
      '格式：Markdown',
      '章节：无',
      '长度：300 到 600 字',
      '语言：中文',
    ].join('\n')
    const write = writeAssumptionValue({ output: text }, 'output.tone', '简洁、口语化')

    expect(write.ok).toBe(true)
    if (!write.ok) {
      throw new Error('写入被拒绝')
    }
    expect(write.mode).toBe('render')
    expect(write.text.split('\n')).toEqual([
      '格式：Markdown',
      '章节：无',
      '长度：300 到 600 字',
      '语言：中文',
      '语气：简洁、口语化',
    ])
  })

  it('补行会带出无关默认行时拒绝，避免改动目标行之外的内容', () => {
    const text = ['格式：Markdown', '语言：中文'].join('\n')
    const write = writeAssumptionValue({ output: text }, 'output.tone', '简洁、口语化')

    expect(write.ok).toBe(false)
    if (write.ok) {
      throw new Error('会新增无关默认行时不应补写成功')
    }
    expect(write.reason).toBe('unsafe-content')
    expect(write.text).toBe(text)
  })

  it('非规范文本缺少目标行时拒绝补写，原文逐字返回', () => {
    const text = [
      '格式：Markdown',
      '这一行没有标签，是我手写的补充。',
      '语言：中文',
    ].join('\n')
    const write = writeAssumptionValue({ output: text }, 'output.tone', '简洁、口语化')

    expect(write.ok).toBe(false)
    if (write.ok) {
      throw new Error('非规范文本不应补写成功')
    }
    expect(write.reason).toBe('unsafe-content')
    expect(write.text).toBe(text)

    const tone = buildAssumptionChips({
      fields: { output: text },
      assumptions: [],
    }).find((chip) => chip.path === 'output.tone')
    expect(tone?.present).toBe(false)
    expect(tone?.applicable).toBe(false)
  })

  it('输出格式只接受能反查回枚举的候选值', () => {
    const fields = allFieldTexts()
    const formatChip = chipFor('output.format')
    for (const candidate of formatChip.candidates) {
      const write = writeAssumptionValue(fields, 'output.format', candidate)
      expect(write.ok, candidate).toBe(true)
    }
    for (const label of Object.values(FORMAT_LABELS)) {
      expect(formatChip.candidates).toContain(label)
    }

    const invalid = writeAssumptionValue(fields, 'output.format', 'PDF')
    expect(invalid.ok).toBe(false)
    if (invalid.ok) {
      throw new Error('未知格式不应写入')
    }
    expect(invalid.reason).toBe('invalid-value')
    expect(invalid.text).toBe(fields.output)
  })

  it('未知路径返回 unsupported-path，不碰任何字段', () => {
    const write = writeAssumptionValue(allFieldTexts(), 'output.nope', '任意值')

    expect(write.ok).toBe(false)
    if (write.ok) {
      throw new Error('未知路径不应写入')
    }
    expect(write.reason).toBe('unsupported-path')
    expect(write.field).toBeNull()
  })
})

describe('假设列表与导出数据', () => {
  it('upsert 把改过的假设标成 user 并保留其他假设', () => {
    const base = [
      ...schema.assumptions,
      {
        path: 'meta.taskType',
        label: '任务类型',
        value: 'writing',
        candidates: ['writing', 'analysis'],
        source: 'inferred' as const,
      },
    ]
    const next = upsertAssumption(base, 'output.language', '英文')
    const language = next.find(
      (assumption) => assumption.path === 'output.language',
    )

    expect(language?.value).toBe('英文')
    expect(language?.source).toBe('user')
    expect(
      next.find((assumption) => assumption.path === 'meta.taskType')?.value,
    ).toBe('writing')
  })

  it('merge 用 chip 当前值覆盖五个路径，并保留模型的其他假设', () => {
    const chips = buildAssumptionChips({
      fields: allFieldTexts(),
      assumptions: schema.assumptions,
    })
    const extra = {
      path: 'meta.taskType',
      label: '任务类型',
      value: 'writing',
      candidates: [],
      source: 'inferred' as const,
    }
    const merged = mergeAssumptions([...schema.assumptions, extra], chips)

    expect(merged.map((assumption) => assumption.path)).toContain(
      'meta.taskType',
    )
    expect(merged.filter((assumption) => assumption.path === 'output.tone')).toHaveLength(
      1,
    )
    expect(
      merged.find((assumption) => assumption.path === 'output.language')?.value,
    ).toBe(chipFor('output.language').value)
  })

  it('导出开关关闭时给出五条带注释的假设，打开时返回空数组', () => {
    const chips = buildAssumptionChips({
      fields: allFieldTexts(),
      assumptions: schema.assumptions,
    })
    const merged = mergeAssumptions(schema.assumptions, chips)
    const exported = buildExportAssumptions(merged, {
      omitAssumptions: false,
    })

    expect(exported.map((item) => item.path)).toEqual([
      'output.language',
      'output.length',
      'output.format',
      'context.audience',
      'output.tone',
    ])
    for (const item of exported) {
      expect(item.comment).toBe(`> 假设：${item.label} = ${item.value}`)
    }
    expect(JSON.stringify(exported)).not.toMatch(/[！!]|——/u)

    expect(
      buildExportAssumptions(merged, { omitAssumptions: true }),
    ).toEqual([])
  })
})
