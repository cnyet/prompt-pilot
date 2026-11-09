import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY_STEPS,
  acceptSuggestion,
  applyPatch,
  applyStreamDelta,
  applyUserEdit,
  canRedo,
  canUndo,
  commitField,
  createPromptDoc,
  discardSuggestion,
  getFieldState,
  redo,
  startField,
  undo,
  type PromptDoc,
} from '@/lib/engine/doc'

function field(doc: PromptDoc, path: string) {
  const state = getFieldState(doc, path)
  if (!state) {
    throw new Error(`缺少字段：${path}`)
  }
  return state
}

function stream(doc: PromptDoc, path: string, text: string): PromptDoc {
  let next = doc
  for (const char of Array.from(text)) {
    next = applyStreamDelta(next, path, char)
  }
  return next
}

describe('R1 流式只写 pending', () => {
  it('delta 累积在 pending，不写文档值、不产生撤销命令', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = applyStreamDelta(doc, 'role', '你是谁：')
    doc = applyStreamDelta(doc, 'role', '编辑')

    expect(doc.pending.role).toBe('你是谁：编辑')
    expect(field(doc, 'role').value).toBe('')
    expect(field(doc, 'role').status).toBe('streaming')
    expect(doc.history).toHaveLength(0)
    expect(doc.seq).toBe(0)
  })

  it('手改后的 delta 仍然只进 pending，文档值保持不变', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = stream(doc, 'role', '你是谁：AI')
    doc = applyUserEdit(doc, 'role', '你是谁：用户')
    const beforeSeq = doc.seq

    doc = stream(doc, 'role', '，继续生成')
    doc = stream(doc, 'role', '更多内容')

    expect(field(doc, 'role').value).toBe('你是谁：用户')
    expect(doc.pending.role).toBe('你是谁：AI，继续生成更多内容')
    expect(field(doc, 'role').seq).toBe(beforeSeq)
  })
})

describe('R2 字段级原子提交', () => {
  it('未手改时提交写入文档，origin 为 ai 并记录 AI 命令', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = stream(doc, 'role', '你是谁：编辑')
    doc = commitField(doc, 'role')

    const state = field(doc, 'role')
    expect(state.value).toBe('你是谁：编辑')
    expect(state.origin).toBe('ai')
    expect(state.aiBaseline).toBe('你是谁：编辑')
    expect(state.dirty).toBe(false)
    expect(state.status).toBe('done')
    expect(doc.pending.role).toBeUndefined()
    expect(doc.seq).toBe(1)
    expect(doc.history).toHaveLength(1)
    expect(doc.history[0]?.type).toBe('ai-write')
    expect(doc.history[0]?.origin).toBe('ai')
  })

  it('字段 dirty 时提交不覆盖，AI 内容变成 suggestion', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = applyStreamDelta(doc, 'role', 'AI 的新版本')
    doc = applyUserEdit(doc, 'role', '我写的版本')
    doc = commitField(doc, 'role')

    const state = field(doc, 'role')
    expect(state.value).toBe('我写的版本')
    expect(state.dirty).toBe(true)
    expect(state.status).toBe('suggested')
    expect(state.suggestion?.value).toBe('AI 的新版本')
    expect(state.suggestion?.origin).toBe('ai')
    // 只有用户编辑进撤销栈，建议本身不改文档值。
    expect(doc.history).toHaveLength(1)
    expect(doc.history[0]?.type).toBe('user-edit')
  })

  it('采纳建议是一次 origin 为 ai 的显式写入，丢弃建议不产生命令', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = applyStreamDelta(doc, 'role', 'AI 版本')
    doc = applyUserEdit(doc, 'role', '用户版本')
    doc = commitField(doc, 'role')

    let accepted = acceptSuggestion(doc, 'role')
    expect(field(accepted, 'role').value).toBe('AI 版本')
    expect(field(accepted, 'role').dirty).toBe(false)
    expect(field(accepted, 'role').suggestion).toBeNull()
    expect(accepted.history.at(-1)?.type).toBe('accept-suggestion')
    expect(accepted.history.at(-1)?.origin).toBe('ai')

    const discarded = discardSuggestion(doc, 'role')
    expect(field(discarded, 'role').value).toBe('用户版本')
    expect(field(discarded, 'role').suggestion).toBeNull()
    expect(field(discarded, 'role').status).toBe('edited')
    expect(discarded.history).toHaveLength(1)
  })
})

describe('R3 用户编辑立即写 doc', () => {
  it('编辑当下写入值、seq 加一、dirty 置位，并记录用户命令', () => {
    const doc = createPromptDoc(['role'])
    const edited = applyUserEdit(doc, 'role', '用户输入')

    const state = field(edited, 'role')
    expect(state.value).toBe('用户输入')
    expect(state.origin).toBe('user')
    expect(state.seq).toBe(1)
    expect(state.dirty).toBe(true)
    expect(state.status).toBe('edited')
    expect(edited.seq).toBe(1)
    expect(edited.history).toHaveLength(1)
    expect(edited.history[0]?.origin).toBe('user')
    expect(edited.history[0]?.before).toBe('')
    expect(edited.history[0]?.after).toBe('用户输入')
  })
})

describe('R4 补丁必须显式接受', () => {
  it('默认拒绝，不写文档也不产生命令', () => {
    const doc = createPromptDoc(['role'])
    const result = applyPatch(doc, { path: 'role', value: '补丁内容' })

    expect(result.outcome).toBe('rejected')
    expect(field(result.doc, 'role').value).toBe('')
    expect(result.doc.history).toHaveLength(0)
  })

  it('显式接受后写入，origin 为 patch', () => {
    const doc = createPromptDoc(['role'])
    const result = applyPatch(
      doc,
      { path: 'role', value: '补丁内容' },
      'accept',
    )

    expect(result.outcome).toBe('applied')
    expect(field(result.doc, 'role').value).toBe('补丁内容')
    expect(field(result.doc, 'role').origin).toBe('patch')
    expect(field(result.doc, 'role').status).toBe('done')
    expect(result.doc.history.at(-1)?.type).toBe('patch')
    expect(result.doc.history.at(-1)?.origin).toBe('patch')
  })

  it('目标字段 dirty 时默认冲突，只有 overwrite 才生效', () => {
    const doc = applyUserEdit(createPromptDoc(['role']), 'role', '用户手改')
    const conflict = applyPatch(
      doc,
      { path: 'role', value: '补丁内容' },
      'accept',
    )
    expect(conflict.outcome).toBe('conflict')
    expect(field(conflict.doc, 'role').value).toBe('用户手改')
    expect(conflict.doc.history).toHaveLength(1)

    const overwritten = applyPatch(
      doc,
      { path: 'role', value: '补丁内容' },
      'overwrite',
    )
    expect(overwritten.outcome).toBe('applied')
    expect(field(overwritten.doc, 'role').value).toBe('补丁内容')
    expect(field(overwritten.doc, 'role').origin).toBe('patch')
    expect(field(overwritten.doc, 'role').dirty).toBe(true)
  })

  it('未知路径返回 unknown-field', () => {
    const result = applyPatch(
      createPromptDoc(['role']),
      { path: 'objective.goal', value: 'x' },
      'accept',
    )
    expect(result.outcome).toBe('unknown-field')
  })
})

describe('AC-17 手改不被流覆盖', () => {
  it('流式中编辑后，最终保留用户输入，被跳过的 AI 内容作为建议保留', () => {
    let doc = createPromptDoc(['role'])
    doc = startField(doc, 'role')
    doc = applyStreamDelta(doc, 'role', '你是谁：')
    doc = applyStreamDelta(doc, 'role', 'AI 编辑')

    // 用户在生成过程中直接改字段。
    doc = applyUserEdit(doc, 'role', '你是谁：我的角色')

    // 后续 delta 继续到达同一字段。
    doc = applyStreamDelta(doc, 'role', '，负责校对')
    doc = applyStreamDelta(doc, 'role', '与润色')

    // 字段完成事件触发原子提交。
    doc = commitField(doc, 'role')

    const state = field(doc, 'role')
    expect(state.value).toBe('你是谁：我的角色')
    expect(state.value).not.toContain('负责校对')
    expect(state.dirty).toBe(true)
    expect(state.status).toBe('suggested')
    expect(state.suggestion?.value).toBe('你是谁：AI 编辑，负责校对与润色')

    const accepted = acceptSuggestion(doc, 'role')
    expect(field(accepted, 'role').value).toBe(
      '你是谁：AI 编辑，负责校对与润色',
    )
  })
})

describe('命令式撤销栈', () => {
  it('50 次编辑后撤销 50 步回到初始状态，重做逐步还原', () => {
    let doc = createPromptDoc(['role'])
    for (let index = 1; index <= MAX_HISTORY_STEPS; index += 1) {
      doc = applyUserEdit(doc, 'role', `版本 ${index}`)
    }
    expect(doc.history).toHaveLength(MAX_HISTORY_STEPS)
    expect(field(doc, 'role').value).toBe('版本 50')

    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) {
      expect(canUndo(doc)).toBe(true)
      doc = undo(doc)
    }

    expect(field(doc, 'role').value).toBe('')
    expect(field(doc, 'role').dirty).toBe(false)
    expect(field(doc, 'role').status).toBe('idle')
    expect(doc.history).toHaveLength(0)
    expect(doc.redo).toHaveLength(MAX_HISTORY_STEPS)
    expect(canUndo(doc)).toBe(false)

    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) {
      doc = redo(doc)
    }
    expect(field(doc, 'role').value).toBe('版本 50')
    expect(doc.history).toHaveLength(MAX_HISTORY_STEPS)
    expect(canRedo(doc)).toBe(false)
  })

  it('超过 50 步时丢弃最旧命令，最多回退 50 步', () => {
    let doc = createPromptDoc(['role'])
    for (let index = 1; index <= 60; index += 1) {
      doc = applyUserEdit(doc, 'role', `版本 ${index}`)
    }
    expect(doc.history).toHaveLength(MAX_HISTORY_STEPS)

    for (let step = 0; step < MAX_HISTORY_STEPS; step += 1) {
      doc = undo(doc)
    }
    expect(field(doc, 'role').value).toBe('版本 10')
    expect(canUndo(doc)).toBe(false)
  })

  it('撤销栈区分 AI 写入与用户编辑，撤销后 dirty 与 origin 正确恢复', () => {
    let doc = createPromptDoc(['role', 'objective'])
    doc = applyUserEdit(doc, 'role', '用户写的角色')
    doc = startField(doc, 'objective')
    doc = stream(doc, 'objective', 'AI 写的目标')
    doc = commitField(doc, 'objective')

    expect(doc.history.map((command) => command.origin)).toEqual([
      'user',
      'ai',
    ])
    expect(doc.history.map((command) => command.type)).toEqual([
      'user-edit',
      'ai-write',
    ])

    const afterAiUndo = undo(doc)
    expect(field(afterAiUndo, 'objective').value).toBe('')
    expect(field(afterAiUndo, 'objective').status).toBe('idle')
    expect(field(afterAiUndo, 'role').value).toBe('用户写的角色')

    const afterUserUndo = undo(afterAiUndo)
    expect(field(afterUserUndo, 'role').value).toBe('')
    expect(field(afterUserUndo, 'role').dirty).toBe(false)
    expect(field(afterUserUndo, 'role').origin).toBe('ai')

    const redone = redo(redo(afterUserUndo))
    expect(field(redone, 'role').value).toBe('用户写的角色')
    expect(field(redone, 'objective').value).toBe('AI 写的目标')
  })

  it('新的写入会清空重做栈', () => {
    let doc = createPromptDoc(['role'])
    doc = applyUserEdit(doc, 'role', '第一次')
    doc = applyUserEdit(doc, 'role', '第二次')
    doc = undo(doc)
    expect(canRedo(doc)).toBe(true)

    doc = applyUserEdit(doc, 'role', '新分支')
    expect(canRedo(doc)).toBe(false)
    expect(field(doc, 'role').value).toBe('新分支')
  })
})
