import { describe, expect, it } from 'vitest'
import { composePrompt } from '@/lib/engine/compose'
import {
  applyFieldRewrite,
  applyUserEdit,
  createPromptDoc,
  getFieldState,
  type FieldState,
  type PromptDoc,
} from '@/lib/engine/doc'
import { renderFieldText } from '@/lib/engine/render'
import { parseField } from '@/lib/engine/paths'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import { applyFieldOp } from '@/components/studio/fieldOps'
import { FIELD_OPS } from '@/components/studio/types'
import { generationReducer } from '@/components/studio/useGeneration'
import { createInitialState } from '@/components/studio/types'

const requirement =
  '帮我写一份产品需求评审周报，给业务负责人看，输出 Markdown，800 字左右'
const schema = composePrompt(requirement)
const context = { requirement, title: schema.meta.title }

function createFilledDoc(): PromptDoc {
  let doc = createPromptDoc(FIELD_KEYS)
  for (const field of FIELD_KEYS) {
    doc = applyFieldRewrite(doc, field, renderFieldText(schema, field))
  }
  return doc
}

function fieldState(doc: PromptDoc, field: FieldKey): FieldState {
  const state = getFieldState(doc, field)
  if (!state) {
    throw new Error(`缺少字段：${field}`)
  }
  return state
}

/** 其余字段的完整状态快照。比较字符串即比较 UTF-8 字节。 */
function snapshotOtherFields(doc: PromptDoc, target: FieldKey): string {
  const snapshot: Partial<Record<FieldKey, FieldState>> = {}
  for (const field of FIELD_KEYS) {
    if (field !== target) {
      snapshot[field] = fieldState(doc, field)
    }
  }
  return JSON.stringify(snapshot)
}

describe('单字段重算只改目标字段', () => {
  it('四种操作后其余字段的 JSON 序列化逐字节相等', () => {
    const doc = createFilledDoc()

    for (const field of ['constraints', 'output', 'context'] as const) {
      const before = fieldState(doc, field).value
      const othersBefore = snapshotOtherFields(doc, field)

      for (const op of FIELD_OPS) {
        const nextText = applyFieldOp(field, before, op, context)
        const nextDoc = applyFieldRewrite(doc, field, nextText)
        const othersAfter = snapshotOtherFields(nextDoc, field)

        // 字符串相等即 UTF-8 字节相等；另外用 Buffer 再断言一次。
        expect(othersAfter, `${field}/${op}`).toBe(othersBefore)
        expect(
          Buffer.from(othersAfter, 'utf8').equals(
            Buffer.from(othersBefore, 'utf8'),
          ),
          `${field}/${op}`,
        ).toBe(true)
        expect(fieldState(nextDoc, field).value, `${field}/${op}`).toBe(
          nextText,
        )
        expect(fieldState(nextDoc, field).seq, `${field}/${op}`).toBe(
          nextDoc.seq,
        )
        expect(fieldState(nextDoc, field).seq, `${field}/${op}`).toBeGreaterThan(
          fieldState(doc, field).seq,
        )
      }
    }
  })

  it('目标字段的来源回到 AI，手改标记清零，并记录一条可撤销命令', () => {
    const doc = createFilledDoc()
    const nextText = applyFieldOp(
      'constraints',
      fieldState(doc, 'constraints').value,
      'shorten',
      context,
    )
    const nextDoc = applyFieldRewrite(doc, 'constraints', nextText)

    const state = fieldState(nextDoc, 'constraints')
    expect(state.origin).toBe('ai')
    expect(state.dirty).toBe(false)
    expect(state.status).toBe('done')
    expect(state.suggestion).toBeNull()
    expect(state.aiBaseline).toBe(nextText)
    expect(nextDoc.history.at(-1)?.type).toBe('field-rewrite')
    expect(nextDoc.history.at(-1)?.origin).toBe('ai')
    expect(nextDoc.history.at(-1)?.before).toBe(
      fieldState(doc, 'constraints').value,
    )
    expect(nextDoc.history.at(-1)?.after).toBe(nextText)
  })

  it('用户手改过的字段也能显式重算，重算后来源标记重新出现', () => {
    const doc = createFilledDoc()
    const edited = applyUserEdit(
      doc,
      'output',
      `${fieldState(doc, 'output').value}\n补充：这是我手改的一行。`,
    )
    expect(fieldState(edited, 'output').dirty).toBe(true)
    expect(fieldState(edited, 'output').origin).toBe('user')
    const othersBefore = snapshotOtherFields(edited, 'output')

    const nextText = applyFieldOp(
      'output',
      fieldState(edited, 'output').value,
      'specific',
      context,
    )
    const rewrote = applyFieldRewrite(edited, 'output', nextText)

    expect(fieldState(rewrote, 'output').dirty).toBe(false)
    expect(fieldState(rewrote, 'output').origin).toBe('ai')
    expect(fieldState(rewrote, 'output').value).toBe(nextText)
    expect(snapshotOtherFields(rewrote, 'output')).toBe(othersBefore)
  })
})

describe('四种操作的结果可区分且确定', () => {
  it('加长更长、缩短更短、更具体与重新生成各不同', () => {
    const doc = createFilledDoc()
    const original = fieldState(doc, 'constraints').value

    const lengthened = applyFieldOp('constraints', original, 'lengthen', context)
    const shortened = applyFieldOp('constraints', original, 'shorten', context)
    const specified = applyFieldOp('constraints', original, 'specific', context)
    const regenerated = applyFieldOp(
      'constraints',
      original,
      'regenerate',
      context,
    )

    expect(lengthened.length).toBeGreaterThan(original.length)
    expect(shortened.length).toBeLessThan(original.length)
    expect(specified).not.toBe(original)
    expect(regenerated).not.toBe(original)
    expect(new Set([original, lengthened, shortened, specified, regenerated]).size).toBe(
      5,
    )
  })

  it('同一输入重复执行得到同一结果', () => {
    const doc = createFilledDoc()
    for (const field of ['constraints', 'output', 'context'] as const) {
      const original = fieldState(doc, field).value
      for (const op of FIELD_OPS) {
        expect(applyFieldOp(field, original, op, context), `${field}/${op}`).toBe(
          applyFieldOp(field, original, op, context),
        )
      }
    }
  })

  it('缩短会减少列表项并压缩长句', () => {
    const doc = createFilledDoc()
    const original = fieldState(doc, 'constraints').value
    const shortened = applyFieldOp('constraints', original, 'shorten', context)

    expect(shortened.split('\n').length).toBeLessThan(
      original.split('\n').length,
    )
    expect(shortened).not.toContain('不代替用户做未授权的最终决定。')
  })

  it('更具体会把模糊限定词换成可核对口径', () => {
    const text = '必须：尽量覆盖一些边界，必要时补充说明。'
    const next = applyFieldOp('constraints', text, 'specific', context)
    expect(next).not.toBe(text)
    expect(next).not.toContain('尽量')
    expect(next).toContain('3 条要点')
  })
})

describe('边界情况', () => {
  it('空字段不产生内容', () => {
    for (const op of FIELD_OPS) {
      expect(applyFieldOp('role', '', op, context)).toBe('')
      expect(applyFieldOp('role', '   ', op, context)).toBe('   ')
    }
  })

  it('重复执行重新生成仍保持目标字段可解析', () => {
    const doc = createFilledDoc()
    const original = fieldState(doc, 'output').value
    const first = applyFieldOp('output', original, 'regenerate', context)
    const second = applyFieldOp('output', first, 'regenerate', context)

    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    expect(first).not.toBe(original)
  })

  it('未改动的字段在重算后仍保持同一个对象引用', () => {
    const doc = createFilledDoc()
    const before = fieldState(doc, 'role')
    const nextText = applyFieldOp(
      'context',
      fieldState(doc, 'context').value,
      'lengthen',
      context,
    )
    const nextDoc = applyFieldRewrite(doc, 'context', nextText)

    expect(fieldState(nextDoc, 'role')).toBe(before)
    expect(nextDoc.fields.role).toBe(doc.fields.role)
  })
})


describe('reducer 接线', () => {
  it('field-rewrite 只写目标字段并清掉进行中状态', () => {
    let state = generationReducer(createInitialState(), {
      type: 'begin',
      fields: FIELD_KEYS,
      full: true,
    })
    state = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '你是谁：一名产品编辑',
    })
    state = generationReducer(state, {
      type: 'edit',
      field: 'context',
      text: '背景：产品评审周报',
    })
    const contextBefore = JSON.stringify(state.doc.fields.context)

    state = generationReducer(state, {
      type: 'op-start',
      field: 'role',
      action: 'lengthen',
    })
    expect(state.fieldOps.role?.status).toBe('running')

    state = generationReducer(state, {
      type: 'op-progress',
      field: 'role',
      text: '你是谁：一名产品编辑，并说明判断依据。',
    })
    expect(state.fieldOps.role?.preview).toContain('判断依据')

    state = generationReducer(state, {
      type: 'field-rewrite',
      field: 'role',
      text: '你是谁：一名产品编辑，并说明判断依据。',
    })

    expect(state.doc.fields.role?.value).toBe(
      '你是谁：一名产品编辑，并说明判断依据。',
    )
    expect(state.doc.fields.role?.origin).toBe('ai')
    expect(state.doc.fields.role?.dirty).toBe(false)
    expect(JSON.stringify(state.doc.fields.context)).toBe(contextBefore)
    expect(state.fieldOps.role).toBeUndefined()
  })

  it('op-fail 保留原文本，只标记字段级错误', () => {
    let state = generationReducer(createInitialState(), {
      type: 'begin',
      fields: FIELD_KEYS,
      full: true,
    })
    state = generationReducer(state, {
      type: 'edit',
      field: 'output',
      text: '格式：Markdown',
    })
    state = generationReducer(state, {
      type: 'op-start',
      field: 'output',
      action: 'shorten',
    })
    state = generationReducer(state, {
      type: 'op-fail',
      field: 'output',
      message: '重算中断',
    })

    expect(state.doc.fields.output?.value).toBe('格式：Markdown')
    expect(state.fieldOps.output?.status).toBe('failed')
    expect(state.fieldOps.output?.error).toBe('重算中断')
  })
})


describe('doc.schema 同步', () => {
  it('非流式动作后由字段文本重建 schema，编辑后立即反映', () => {
    let state = generationReducer(createInitialState(), {
      type: 'begin',
      fields: FIELD_KEYS,
      full: true,
    })
    expect(state.doc.schema).not.toBeNull()

    state = generationReducer(state, {
      type: 'edit',
      field: 'output',
      text: '格式：JSON\n语言：英文',
    })
    expect(state.doc.schema?.output.format).toBe('json')
    expect(state.doc.schema?.output.language).toBe('英文')

    state = generationReducer(state, {
      type: 'edit',
      field: 'context',
      text: '背景：乙\n受众：新同事',
    })
    expect(state.doc.schema?.context.audience).toBe('新同事')
    expect(state.doc.schema?.output.language).toBe('英文')
    expect(state.doc.schema?.output.format).toBe('json')
  })
})

describe('尾随换行', () => {
  it('字段文本带尾随换行时，补充句不会落到换行之后', () => {
    const text = '格式：Markdown\n语言：中文\n'
    const next = applyFieldOp('output', text, 'lengthen', context)

    expect(next.endsWith('\n')).toBe(true)
    expect(next.split('\n').filter(Boolean)).toHaveLength(2)
    const parsed = parseField('output', next).value
    expect(parsed.language).toContain('中文')
    expect(parsed.language).not.toContain('\n')
    expect(parsed.format).toBe('markdown')
  })
})


describe('枚举叶子保持可反查', () => {
  it('加长与更具体不改 output.format，格式仍能解析回枚举值', () => {
    const outputText = renderFieldText(schema, 'output')
    for (const op of ['lengthen', 'specific'] as const) {
      const next = applyFieldOp('output', outputText, op, context)
      const parsed = parseField('output', next).value
      expect(parsed.format, op).toBe(schema.output.format)
      expect(next, op).not.toBe(outputText)
      expect(next, op).not.toContain('格式：Markdown，')
    }
  })
})
