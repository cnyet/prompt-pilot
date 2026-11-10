import { describe, expect, it, vi } from 'vitest'
import {
  ASSUMPTION_DEFINITIONS,
  buildAssumptionChips,
  buildExportAssumptions,
  mergeAssumptions,
} from '@/lib/engine/assumptions'
import { composePrompt } from '@/lib/engine/compose'
import { extractLeaves, replaceLeafValue } from '@/lib/engine/paths'
import { renderFieldText } from '@/lib/engine/render'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import type { Assumption } from '@/lib/engine/schema'
import { generationReducer } from '@/components/studio/useGeneration'
import {
  createInitialState,
  type GenerationState,
} from '@/components/studio/types'

const requirement =
  '帮我写一份产品需求评审周报，给业务负责人看，输出 Markdown，800 字左右'
const schema = composePrompt(requirement)

function renderedFields(): Record<FieldKey, string> {
  return Object.fromEntries(
    FIELD_KEYS.map((field) => [field, renderFieldText(schema, field)] as const),
  ) as Record<FieldKey, string>
}

/** 走完整的生成落盘路径：八个字段逐个 delta 再 done。 */
function generatedState(
  assumptions: Assumption[] = schema.assumptions,
): GenerationState {
  const texts = renderedFields()
  let state = generationReducer(createInitialState(), {
    type: 'begin',
    fields: FIELD_KEYS,
    full: true,
  })
  for (const field of FIELD_KEYS) {
    state = generationReducer(state, { type: 'field-start', field })
    state = generationReducer(state, {
      type: 'delta',
      field,
      text: texts[field],
    })
    state = generationReducer(state, { type: 'field-done', field })
  }
  return generationReducer(state, {
    type: 'done',
    title: schema.meta.title,
    assumptions,
    durationMs: 1200,
    finishReason: 'stop',
  })
}

function fieldTexts(state: GenerationState): Record<FieldKey, string> {
  return Object.fromEntries(
    FIELD_KEYS.map(
      (field) => [field, state.doc.fields[field]?.value ?? ''] as const,
    ),
  ) as Record<FieldKey, string>
}

function chipsOf(state: GenerationState) {
  return buildAssumptionChips({
    fields: fieldTexts(state),
    assumptions: state.assumptions,
    baselineValues: state.baselineAssumptionValues,
  })
}

function chipOf(state: GenerationState, path: string) {
  const chip = chipsOf(state).find((candidate) => candidate.path === path)
  if (!chip) {
    throw new Error(`缺少 chip：${path}`)
  }
  return chip
}

function modifiedPaths(state: GenerationState): string[] {
  return chipsOf(state)
    .filter((chip) => chip.modified)
    .map((chip) => chip.path)
}

function differentCandidate(path: string): string {
  const chip = chipsOf(generatedState()).find(
    (candidate) => candidate.path === path,
  )
  if (!chip) {
    throw new Error(`缺少 chip：${path}`)
  }
  const next = chip.candidates.find((candidate) => candidate !== chip.value)
  if (!next) {
    throw new Error(`chip 没有可选的其他候选：${path}`)
  }
  return next
}

describe('生成完成后的假设 chip', () => {
  it('模型只给四条假设时，仍渲染五条 chip，语气从字段文本补齐', () => {
    const state = generatedState()
    const chips = chipsOf(state)

    expect(state.phase).toBe('done')
    expect(chips.map((chip) => chip.path)).toEqual(
      ASSUMPTION_DEFINITIONS.map((definition) => definition.path),
    )
    expect(chips.find((chip) => chip.path === 'output.tone')?.value).toBe(
      schema.output.tone,
    )
    expect(
      state.doc.schema?.assumptions.map((assumption) => assumption.path),
    ).toEqual([
      'output.language',
      'output.length',
      'output.format',
      'context.audience',
      'output.tone',
    ])
  })

  it('连模型假设都没有时，五条 chip 仍从字段文本读出当前值', () => {
    const state = generatedState([])
    const chips = chipsOf(state)

    expect(chips).toHaveLength(5)
    expect(chips.every((chip) => chip.present)).toBe(true)
    expect(chips.every((chip) => chip.value.length > 0)).toBe(true)
    expect(chips.find((chip) => chip.path === 'context.audience')?.value).toBe(
      schema.context.audience,
    )
  })
})

describe('只重算受该假设影响的那一个字段', () => {
  const cases = ASSUMPTION_DEFINITIONS.map((definition) => ({
    path: definition.path,
    targetField: definition.targetField,
    nextValue: differentCandidate(definition.path),
  }))

  it.each(cases)(
    '改 $path 只写 $targetField，其余七个字段逐字节不变',
    ({ path, targetField, nextValue }) => {
      const state = generatedState()
      const before = fieldTexts(state)
      const nextState = generationReducer(state, {
        type: 'assumption-change',
        path,
        value: nextValue,
      })
      const after = fieldTexts(nextState)

      expect(after[targetField]).not.toBe(before[targetField])
      for (const field of FIELD_KEYS) {
        if (field === targetField) {
          continue
        }
        expect(after[field], field).toBe(before[field])
      }

      // 目标字段内部也只有一个叶子变化，写回必须与 replaceLeafValue 逐字一致。
      const expected = replaceLeafValue(
        targetField,
        before[targetField],
        path,
        nextValue,
      )
      expect(expected.replaced).toBe(true)
      expect(after[targetField]).toBe(expected.text)

      const beforeLeaves = extractLeaves(targetField, before[targetField])
      const afterLeaves = extractLeaves(targetField, after[targetField])
      for (const leaf of beforeLeaves) {
        if (leaf.path === path) {
          continue
        }
        expect(
          afterLeaves.find((candidate) => candidate.path === leaf.path)?.value,
          leaf.path,
        ).toBe(leaf.value)
      }

      const chip = chipsOf(nextState).find(
        (candidate) => candidate.path === path,
      )
      expect(chip?.value).toBe(nextValue)
      expect(chip?.modified).toBe(true)
      for (const other of chipsOf(nextState)) {
        if (other.path !== path) {
          expect(other.modified, other.path).toBe(false)
        }
      }
    },
  )

  it('手写游离行在 chip 写回后仍逐字保留', () => {
    const withFreeLine = [
      '格式：Markdown',
      '这一行没有标签，是我手写的约束。',
      '语言：中文',
      '语气：专业、克制、直接',
    ].join('\n')
    let state = generatedState()
    state = generationReducer(state, {
      type: 'edit',
      field: 'output',
      text: withFreeLine,
    })
    const before = fieldTexts(state)

    state = generationReducer(state, {
      type: 'assumption-change',
      path: 'output.language',
      value: '英文',
    })

    expect(state.doc.fields.output?.value).toContain(
      '这一行没有标签，是我手写的约束。',
    )
    expect(state.doc.fields.output?.value).toContain('语言：英文')
    for (const field of FIELD_KEYS) {
      if (field === 'output') {
        continue
      }
      expect(fieldTexts(state)[field], field).toBe(before[field])
    }
  })

  it('非规范字段缺少目标行时整次写入被拒绝，状态引用不变', () => {
    const withoutTone = [
      '格式：Markdown',
      '这一行没有标签，是我手写的约束。',
      '语言：中文',
    ].join('\n')
    let state = generatedState()
    state = generationReducer(state, {
      type: 'edit',
      field: 'output',
      text: withoutTone,
    })
    const before = state

    const nextState = generationReducer(state, {
      type: 'assumption-change',
      path: 'output.tone',
      value: '简洁、口语化',
    })

    expect(nextState).toBe(before)
    expect(nextState.doc.fields.output?.value).toBe(withoutTone)
  })

  it('未知路径与非法格式都不改文档，也不打「已改」标记', () => {
    const state = generatedState()
    for (const action of [
      { path: 'output.nope', value: '任意值' },
      { path: 'output.format', value: 'PDF' },
    ]) {
      const nextState = generationReducer(state, {
        type: 'assumption-change',
        ...action,
      })
      expect(nextState, action.path).toBe(state)
      expect(nextState.baselineAssumptionValues, action.path).toBe(
        state.baselineAssumptionValues,
      )
      expect(modifiedPaths(nextState), action.path).toEqual([])
    }
  })
})

describe('无模型 Key 时的本地重算路径', () => {
  it('chip 变更不调用 fetch，纯 reducer 即可完成重算', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('chip 重算不应联网')
    })
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const state = generatedState([])
      const nextState = generationReducer(state, {
        type: 'assumption-change',
        path: 'output.language',
        value: '英文',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(state.doc.fields.output?.value).toContain('语言：中文')
      expect(nextState.doc.fields.output?.value).toContain('语言：英文')
      expect(
        chipsOf(nextState).find((chip) => chip.path === 'output.language')
          ?.value,
      ).toBe('英文')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('撤销与重做后的「已改」标记', () => {
  it('撤销一次 chip 修改：字段文本与「已改」标记同时回退', () => {
    const state = generatedState()
    const before = fieldTexts(state)
    expect(modifiedPaths(state)).toEqual([])

    let nextState = generationReducer(state, {
      type: 'assumption-change',
      path: 'output.language',
      value: '英文',
    })
    expect(fieldTexts(nextState).output).toContain('语言：英文')
    expect(chipOf(nextState, 'output.language').modified).toBe(true)
    expect(modifiedPaths(nextState)).toEqual(['output.language'])
    expect(nextState.doc.schema?.output.language).toBe('英文')

    nextState = generationReducer(nextState, { type: 'undo' })

    expect(fieldTexts(nextState).output).toBe(before.output)
    expect(chipOf(nextState, 'output.language').value).toBe('中文')
    expect(chipOf(nextState, 'output.language').modified).toBe(false)
    expect(chipOf(nextState, 'output.language').source).not.toBe('user')
    expect(modifiedPaths(nextState)).toEqual([])
    expect(nextState.doc.schema?.output.language).toBe('中文')
    expect(
      nextState.doc.schema?.assumptions.find(
        (assumption) => assumption.path === 'output.language',
      )?.value,
    ).toBe('中文')
  })

  it('手改字段里的假设叶子也会立即标成「已改」，撤销后复原', () => {
    const state = generatedState()
    const before = fieldTexts(state)
    const editedOutput = before.output.replace('语言：中文', '语言：英文')
    expect(editedOutput).not.toBe(before.output)

    let nextState = generationReducer(state, {
      type: 'edit',
      field: 'output',
      text: editedOutput,
    })
    expect(chipOf(nextState, 'output.language').modified).toBe(true)

    nextState = generationReducer(nextState, { type: 'undo' })
    expect(fieldTexts(nextState).output).toBe(before.output)
    expect(chipOf(nextState, 'output.language').modified).toBe(false)
  })

  it('撤销一次与 chip 无关的编辑：其他 chip 的「已改」标记保持不变', () => {
    const state = generatedState()
    const roleBefore = state.doc.fields.role?.value ?? ''
    const originalAudience = chipOf(state, 'context.audience').value
    const nextAudience = differentCandidate('context.audience')

    let nextState = generationReducer(state, {
      type: 'assumption-change',
      path: 'context.audience',
      value: nextAudience,
    })
    expect(chipOf(nextState, 'context.audience').modified).toBe(true)

    nextState = generationReducer(nextState, {
      type: 'edit',
      field: 'role',
      text: '你是谁：负责另一条线的角色。',
    })
    expect(chipOf(nextState, 'context.audience').modified).toBe(true)

    nextState = generationReducer(nextState, { type: 'undo' })

    expect(fieldTexts(nextState).role).toBe(roleBefore)
    expect(chipOf(nextState, 'context.audience').value).not.toBe(
      originalAudience,
    )
    expect(chipOf(nextState, 'context.audience').modified).toBe(true)
    expect(modifiedPaths(nextState)).toEqual(['context.audience'])
  })

  it('撤销一次无关编辑不会误标任何 chip', () => {
    const state = generatedState()
    const before = fieldTexts(state)
    expect(modifiedPaths(state)).toEqual([])

    let nextState = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '你是谁：一个临时角色。',
    })
    nextState = generationReducer(nextState, { type: 'undo' })

    expect(fieldTexts(nextState).role).toBe(before.role)
    expect(modifiedPaths(nextState)).toEqual([])
  })

  it('同一字段连续改两条 chip，撤销一步只回退最后一条的标记', () => {
    const baselineState = generatedState()
    const before = fieldTexts(baselineState)
    const baselineLength = chipOf(baselineState, 'output.length').value
    const nextLength = differentCandidate('output.length')

    let nextState = generationReducer(baselineState, {
      type: 'assumption-change',
      path: 'output.language',
      value: '英文',
    })
    nextState = generationReducer(nextState, {
      type: 'assumption-change',
      path: 'output.length',
      value: nextLength,
    })
    expect(modifiedPaths(nextState)).toEqual([
      'output.language',
      'output.length',
    ])

    nextState = generationReducer(nextState, { type: 'undo' })
    expect(chipOf(nextState, 'output.length').value).toBe(baselineLength)
    expect(chipOf(nextState, 'output.length').modified).toBe(false)
    expect(modifiedPaths(nextState)).toEqual(['output.language'])

    nextState = generationReducer(nextState, { type: 'undo' })
    expect(fieldTexts(nextState).output).toBe(before.output)
    expect(modifiedPaths(nextState)).toEqual([])
  })

  it('重做一次 chip 修改：字段文本与「已改」标记一起恢复', () => {
    const state = generatedState()

    let nextState = generationReducer(state, {
      type: 'assumption-change',
      path: 'output.language',
      value: '英文',
    })
    const changedOutput = fieldTexts(nextState).output
    nextState = generationReducer(nextState, { type: 'undo' })
    expect(modifiedPaths(nextState)).toEqual([])

    nextState = generationReducer(nextState, { type: 'redo' })

    expect(fieldTexts(nextState).output).toBe(changedOutput)
    expect(chipOf(nextState, 'output.language').value).toBe('英文')
    expect(chipOf(nextState, 'output.language').modified).toBe(true)
    expect(chipOf(nextState, 'output.language').source).toBe('user')
    expect(modifiedPaths(nextState)).toEqual(['output.language'])
  })
})

describe('导出时剔除假设的开关与数据', () => {
  it('开关默认关闭，导出数据含五条注释；打开后导出数据为空', () => {
    const state = generatedState()
    const exportInput = mergeAssumptions(state.assumptions, chipsOf(state))

    expect(state.exportWithoutAssumptions).toBe(false)
    const exported = buildExportAssumptions(exportInput, {
      omitAssumptions: state.exportWithoutAssumptions,
    })
    expect(exported).toHaveLength(5)
    expect(exported.every((item) => item.comment.startsWith('> 假设：'))).toBe(
      true,
    )

    const toggled = generationReducer(state, {
      type: 'set-export-without-assumptions',
      value: true,
    })
    expect(toggled.exportWithoutAssumptions).toBe(true)
    expect(
      buildExportAssumptions(exportInput, {
        omitAssumptions: toggled.exportWithoutAssumptions,
      }),
    ).toEqual([])
    // 开关只影响导出数据，不改文档正文。
    expect(fieldTexts(toggled)).toEqual(fieldTexts(state))
  })
})
