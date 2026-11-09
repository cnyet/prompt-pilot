import { describe, expect, it } from 'vitest'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import { MAX_HISTORY_STEPS } from '@/lib/engine/doc'
import { generationReducer } from '@/components/studio/useGeneration'
import {
  createInitialState,
  toFieldView,
  type FieldView,
  type GenerationState,
} from '@/components/studio/types'

function view(state: GenerationState, field: FieldKey): FieldView {
  return toFieldView(state.doc, field)
}

function beginGeneration(): GenerationState {
  return generationReducer(createInitialState(), {
    type: 'begin',
    fields: FIELD_KEYS,
    full: true,
  })
}

describe('AC-17 手改不被流覆盖（React reducer）', () => {
  it('流式生成中编辑字段，后续 delta 与 field-done 都保留用户输入', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: '你是谁：AI 编辑。',
    })

    // 用户在字段仍是 streaming 时直接打字。
    state = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '你是谁：我的角色。',
    })

    // 用户输入之后还有 delta 到达同一字段。
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: '负责校对。',
    })
    state = generationReducer(state, { type: 'field-done', field: 'role' })

    const role = view(state, 'role')
    expect(role.text).toBe('你是谁：我的角色。')
    expect(role.text).not.toContain('负责校对')
    expect(role.dirty).toBe(true)
    expect(role.status).toBe('suggested')
    expect(role.suggestion?.value).toBe('你是谁：AI 编辑。负责校对。')
    expect(role.pendingText).toBe('')
  })

  it('修复前的无条件追加不会再发生：delta 只累积到 pending', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: 'AI 前半段',
    })
    state = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '用户文本',
    })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: 'AI 后半段',
    })

    expect(view(state, 'role').text).toBe('用户文本')
    expect(view(state, 'role').pendingText).toBe('AI 前半段AI 后半段')

    state = generationReducer(state, { type: 'field-done', field: 'role' })
    expect(view(state, 'role').text).toBe('用户文本')
    expect(view(state, 'role').suggestion?.value).toBe('AI 前半段AI 后半段')
  })

  it('建议可以显式采纳，也能丢弃并保留用户版本', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: 'AI 版本',
    })
    state = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '用户版本',
    })
    state = generationReducer(state, { type: 'field-done', field: 'role' })

    const discarded = generationReducer(state, {
      type: 'discard-suggestion',
      field: 'role',
    })
    expect(view(discarded, 'role').text).toBe('用户版本')
    expect(view(discarded, 'role').suggestion).toBeNull()
    expect(view(discarded, 'role').status).toBe('edited')

    const accepted = generationReducer(state, {
      type: 'accept-suggestion',
      field: 'role',
    })
    expect(view(accepted, 'role').text).toBe('AI 版本')
    expect(view(accepted, 'role').dirty).toBe(false)
    expect(accepted.doc.history.at(-1)?.type).toBe('accept-suggestion')
    expect(accepted.doc.history.at(-1)?.origin).toBe('ai')
  })
})

describe('reducer 撤销与重做', () => {
  it('50 次编辑后撤销 50 步回到初始状态，重做逐步还原', () => {
    let state = beginGeneration()
    for (let index = 1; index <= MAX_HISTORY_STEPS; index += 1) {
      state = generationReducer(state, {
        type: 'edit',
        field: 'role',
        text: `版本 ${index}`,
      })
    }
    expect(state.doc.history).toHaveLength(MAX_HISTORY_STEPS)
    expect(view(state, 'role').text).toBe('版本 50')

    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) {
      state = generationReducer(state, { type: 'undo' })
    }
    expect(view(state, 'role').text).toBe('')
    expect(view(state, 'role').dirty).toBe(false)
    expect(view(state, 'role').status).toBe('idle')
    expect(state.doc.history).toHaveLength(0)
    expect(state.doc.redo).toHaveLength(MAX_HISTORY_STEPS)

    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) {
      state = generationReducer(state, { type: 'redo' })
    }
    expect(view(state, 'role').text).toBe('版本 50')
    expect(view(state, 'role').dirty).toBe(true)
  })

  it('撤销栈区分 AI 写入与用户编辑，撤销后 dirty 标记正确回退', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: 'AI 写的角色',
    })
    state = generationReducer(state, { type: 'field-done', field: 'role' })
    state = generationReducer(state, {
      type: 'edit',
      field: 'role',
      text: '用户改的角色',
    })

    expect(state.doc.history.map((command) => command.type)).toEqual([
      'ai-write',
      'user-edit',
    ])
    expect(state.doc.history.map((command) => command.origin)).toEqual([
      'ai',
      'user',
    ])

    state = generationReducer(state, { type: 'undo' })
    expect(view(state, 'role').text).toBe('AI 写的角色')
    expect(view(state, 'role').dirty).toBe(false)

    state = generationReducer(state, { type: 'undo' })
    expect(view(state, 'role').text).toBe('')
    expect(view(state, 'role').status).toBe('idle')

    state = generationReducer(state, { type: 'redo' })
    expect(view(state, 'role').text).toBe('AI 写的角色')
    state = generationReducer(state, { type: 'redo' })
    expect(view(state, 'role').text).toBe('用户改的角色')
    expect(view(state, 'role').dirty).toBe(true)
  })
})

describe('流中断与停止', () => {
  it('停止时已收到的 pending 落盘为 partial，不丢失内容', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: '生成到一半',
    })
    state = generationReducer(state, { type: 'stop' })

    const role = view(state, 'role')
    expect(state.phase).toBe('stopped')
    expect(role.text).toBe('生成到一半')
    expect(role.status).toBe('partial')
    expect(role.pendingText).toBe('')
    expect(state.doc.history.at(-1)?.type).toBe('ai-partial')
  })

  it('失败时保留已生成文本并标记字段失败', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'field-start', field: 'role' })
    state = generationReducer(state, {
      type: 'delta',
      field: 'role',
      text: '失败前的内容',
    })
    state = generationReducer(state, {
      type: 'fail',
      field: 'role',
      error: {
        code: 'STREAM_FAILED',
        message: '生成中断',
        hint: '重试即可',
        retryable: true,
      },
    })

    const role = view(state, 'role')
    expect(state.phase).toBe('error')
    expect(role.text).toBe('失败前的内容')
    expect(role.status).toBe('failed')
    expect(role.error).toBe('生成中断')
    expect(role.pendingText).toBe('')
  })
})
