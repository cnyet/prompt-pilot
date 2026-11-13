import { describe, expect, it } from 'vitest'
import type { IterationDto, RecordDetailDto } from '@/components/studio-v3/api'
import {
  initialStreamState,
  isRequestActive,
  recoverTransportError,
  shouldFinalizeStreamClosed,
  streamReducer,
  type StreamPhase,
  type StreamState,
} from '@/components/studio-v3/stream-reducer'

// 工作台流式 reducer：只测纯状态迁移，不触碰 React 与网络。
// 事件序列与字段语义来自 Task 4 brief 的 Step 1。

function makeIteration(overrides: Partial<IterationDto> = {}): IterationDto {
  return {
    id: 'it-1',
    seq: 1,
    kind: 'generate',
    instruction: null,
    output: 'ab',
    notes: [],
    modelId: 'mock-valid',
    tokensIn: 10,
    tokensOut: 20,
    costCny: 0.0012,
    latencyMs: 800,
    status: 'completed',
    createdAt: '2026-11-13T00:00:00.000Z',
    ...overrides,
  }
}

function makeDetail(
  iterations: IterationDto[],
  latestOutput: string = iterations.at(-1)?.output ?? '',
): RecordDetailDto {
  const last = iterations.at(-1)
  return {
    record: {
      id: 'rec-1',
      title: '周报',
      mode: 'generate',
      targetType: 'text',
      sourceInput: '帮我写个周报',
      status: last?.status ?? 'completed',
      favorite: false,
      rating: null,
      modelId: last?.modelId ?? null,
      iterationCount: iterations.length,
      tokensIn: last?.tokensIn ?? null,
      tokensOut: last?.tokensOut ?? null,
      costCny: last?.costCny ?? null,
      createdAt: '2026-11-13T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
      latestOutput,
      copiedAt: null,
      originTemplateId: null,
      iterations,
    },
  }
}

function apply(state: StreamState, ...actions: Parameters<typeof streamReducer>[1][]): StreamState {
  return actions.reduce(streamReducer, state)
}

describe('completed 流', () => {
  it('start → delta → meta → usage → done(completed)：正文落到 committed，说明最多 3 条', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'a' },
      { type: 'delta', text: 'b' },
      { type: 'meta', notes: ['n1', 'n2', 'n3', 'n4'] },
      { type: 'usage', usage: { tokensIn: 1, tokensOut: 2, costCny: 0.5, latencyMs: 1200 } },
      { type: 'done', status: 'completed' },
    )

    expect(state.phase).toBe('completed')
    expect(state.recordId).toBe('rec-1')
    expect(state.iterationId).toBe('it-1')
    expect(state.committedOutput).toBe('ab')
    expect(state.draftOutput).toBe('')
    expect(state.notes).toEqual(['n1', 'n2', 'n3'])
    expect(state.usage).toEqual({ tokensIn: 1, tokensOut: 2, costCny: 0.5, latencyMs: 1200 })
    expect(state.error).toBeNull()
    expect(state.settling).toBe(true)
  })

  it('delta 只在 starting / streaming 追加，usage 只在 streaming 合并', () => {
    let state = streamReducer(initialStreamState, { type: 'delta', text: 'idle 时忽略' })
    expect(state.draftOutput).toBe('')

    state = streamReducer(state, { type: 'start', recordId: 'rec-1', iterationId: 'it-1' })
    state = streamReducer(state, {
      type: 'usage',
      usage: { tokensIn: 1, tokensOut: 2 },
    })
    expect(state.usage).toBeNull()

    state = streamReducer(state, { type: 'delta', text: 'a' })
    expect(state.phase).toBe('streaming')
    state = streamReducer(state, {
      type: 'usage',
      usage: { tokensIn: 3, tokensOut: 4 },
    })
    expect(state.usage).toEqual({ tokensIn: 3, tokensOut: 4 })

    state = streamReducer(state, { type: 'done', status: 'completed' })
    state = streamReducer(state, { type: 'delta', text: 'done 后忽略' })
    state = streamReducer(state, {
      type: 'usage',
      usage: { tokensIn: 9, tokensOut: 9 },
    })
    expect(state.committedOutput).toBe('a')
    expect(state.draftOutput).toBe('')
    expect(state.usage).toEqual({ tokensIn: 3, tokensOut: 4 })
  })
})

describe('canceled 流', () => {
  it('abort 先落草稿并进入 canceling，done(canceled) 后 settled 收尾', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '半' },
    )
    state = streamReducer(state, { type: 'abort' })
    expect(state.phase).toBe('canceling')
    expect(state.committedOutput).toBe('半')
    expect(state.draftOutput).toBe('')

    state = streamReducer(state, { type: 'done', status: 'canceled' })
    expect(state.phase).toBe('canceled')
    expect(state.settling).toBe(true)

    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([makeIteration({ output: '半', status: 'canceled' })], '半'),
    })
    expect(state.phase).toBe('canceled')
    expect(state.settling).toBe(false)
    expect(state.committedOutput).toBe('半')
  })

  it('canceling 中直接 settled（没有 done 事件）时收尾为 canceled', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '半' },
      { type: 'abort' },
    )
    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([makeIteration({ output: '半', status: 'canceled' })], '半'),
    })
    expect(state.phase).toBe('canceled')
    expect(state.settling).toBe(false)
  })
})

describe('failed 流', () => {
  it('done(failed) 丢弃 draft、保留上一轮 committed', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '上一轮' },
      { type: 'done', status: 'completed' },
    )
    state = apply(
      state,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-2' },
      { type: 'delta', text: '半' },
      {
        type: 'error',
        error: { code: 'LLM_TIMEOUT', message: '模型响应超时', retryable: true },
      },
      { type: 'done', status: 'failed' },
    )

    expect(state.phase).toBe('failed')
    expect(state.committedOutput).toBe('上一轮')
    expect(state.draftOutput).toBe('')
    expect(state.settling).toBe(true)
    expect(state.error?.code).toBe('LLM_TIMEOUT')
  })

  it('没有 done 的 stream-closed 按失败处理并等待详情', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '半' },
      { type: 'stream-closed' },
    )
    expect(state.phase).toBe('failed')
    expect(state.committedOutput).toBe('')
    expect(state.draftOutput).toBe('')
    expect(state.settling).toBe(true)

    state = streamReducer(state, { type: 'settled', detail: makeDetail([]) })
    expect(state.settling).toBe(false)
  })
})

describe('shouldFinalizeStreamClosed', () => {
  // 循环结束后的收尾决策：只有既没收到 done、也没在 catch 中发过终态时才补发
  it('只在 sawDone 与 terminalDispatched 都为 false 时返回 true', () => {
    expect(shouldFinalizeStreamClosed({ sawDone: false, terminalDispatched: false })).toBe(true)
    expect(shouldFinalizeStreamClosed({ sawDone: true, terminalDispatched: false })).toBe(false)
    expect(shouldFinalizeStreamClosed({ sawDone: false, terminalDispatched: true })).toBe(false)
    expect(shouldFinalizeStreamClosed({ sawDone: true, terminalDispatched: true })).toBe(false)
  })

  it('传输错误带草稿时按取消收尾，且不再补发 stream-closed 覆盖为 failed', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '半截' },
    )

    // hook 在传输错误的 catch 中只发一次 done(canceled)，并置 terminalDispatched
    state = streamReducer(state, { type: 'done', status: 'canceled' })
    if (shouldFinalizeStreamClosed({ sawDone: false, terminalDispatched: true })) {
      state = streamReducer(state, { type: 'stream-closed' })
    }

    expect(state.phase).toBe('canceled')
    expect(state.committedOutput).toBe('半截')
    expect(state.draftOutput).toBe('')
    expect(state.settling).toBe(true)
  })
})

describe('start 语义', () => {
  it('streaming 中重复 start 不重置 draftOutput', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'x' },
    )
    state = streamReducer(state, { type: 'start', recordId: 'rec-1', iterationId: 'it-1' })
    expect(state.phase).toBe('streaming')
    expect(state.draftOutput).toBe('x')
    expect(state.iterationId).toBe('it-1')
  })

  it('新 start 清空 draft 与流内元数据，保留上一轮 committedOutput', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'meta', notes: ['说明'] },
      { type: 'usage', usage: { tokensIn: 1, tokensOut: 2 } },
      { type: 'done', status: 'completed' },
    )
    state = streamReducer(state, { type: 'start', recordId: 'rec-1', iterationId: 'it-2' })

    expect(state.phase).toBe('starting')
    expect(state.iterationId).toBe('it-2')
    expect(state.draftOutput).toBe('')
    expect(state.committedOutput).toBe('ab')
    expect(state.notes).toEqual([])
    expect(state.usage).toBeNull()
    expect(state.error).toBeNull()
    expect(state.settling).toBe(false)
  })
})

describe('settled 语义', () => {
  it('用 detail 的 latestOutput 与对应迭代 notes 覆盖，并保存 detail', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-2' },
      { type: 'delta', text: 'ab' },
      { type: 'meta', notes: ['流内说明'] },
      { type: 'usage', usage: { tokensIn: 1, tokensOut: 2, costCny: 0.5, latencyMs: 100 } },
      { type: 'done', status: 'completed' },
    )
    const detail = makeDetail(
      [
        makeIteration({ id: 'it-1', seq: 1, output: 'old', notes: ['旧说明'] }),
        makeIteration({
          id: 'it-2',
          seq: 2,
          output: 'final',
          notes: ['新一', '新二', '新三'],
          tokensIn: 7,
          tokensOut: 8,
          costCny: 0.02,
          latencyMs: 1200,
        }),
      ],
      'final',
    )

    state = streamReducer(state, { type: 'settled', detail })

    expect(state.detail).toBe(detail)
    expect(state.committedOutput).toBe('final')
    expect(state.notes).toEqual(['新一', '新二', '新三'])
    // SSE 已经给出 usage 时保留流内值
    expect(state.usage).toEqual({ tokensIn: 1, tokensOut: 2, costCny: 0.5, latencyMs: 100 })
    expect(state.settling).toBe(false)
  })

  it('SSE 未给 usage 时用最新迭代补齐 tokens / cost / latency', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-2' },
      { type: 'delta', text: 'ab' },
      { type: 'done', status: 'completed' },
    )
    expect(state.usage).toBeNull()

    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([
        makeIteration({
          id: 'it-2',
          seq: 2,
          output: 'final',
          tokensIn: 5,
          tokensOut: 6,
          costCny: 0.03,
          latencyMs: 900,
        }),
      ]),
    })
    expect(state.usage).toEqual({ tokensIn: 5, tokensOut: 6, costCny: 0.03, latencyMs: 900 })
  })

  it('最新迭代的 tokens 未知时保持 usage 为 null，不补 0', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'done', status: 'completed' },
    )
    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([
        makeIteration({ tokensIn: null, tokensOut: null, costCny: null, latencyMs: null }),
      ]),
    })
    expect(state.usage).toBeNull()
  })

  it('没有匹配迭代时用最新迭代的 notes 兜底', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'missing' },
      { type: 'delta', text: 'ab' },
      { type: 'done', status: 'completed' },
    )
    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([makeIteration({ notes: ['兜底说明'] })]),
    })
    expect(state.notes).toEqual(['兜底说明'])
  })

  it('canceled 且 detail 正文为空时不覆盖上一轮非空正文（C1 防御纵深）', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'done', status: 'completed' },
    )
    state = apply(
      state,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-2' },
      { type: 'abort' },
      { type: 'done', status: 'canceled' },
    )
    expect(state.committedOutput).toBe('ab')

    // 服务端还在写库时拉到的旧详情：latestOutput 为空，迭代最新轮 output 为空
    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail(
        [
          makeIteration({ id: 'it-1', output: 'ab' }),
          makeIteration({ id: 'it-2', seq: 2, output: '', status: 'canceled' }),
        ],
        '',
      ),
    })
    expect(state.phase).toBe('canceled')
    expect(state.committedOutput).toBe('ab')
    expect(state.settling).toBe(false)
  })

  it('canceled 但 detail 有正文时仍以 detail 为准', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: '半' },
      { type: 'abort' },
      { type: 'done', status: 'canceled' },
    )
    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([makeIteration({ output: '半', status: 'canceled' })], '半'),
    })
    expect(state.committedOutput).toBe('半')
  })
})

describe('settle-failed 语义', () => {
  it('清掉 settling、标记 settleFailed，保留正文与流内用量', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'usage', usage: { tokensIn: 3, tokensOut: 4 } },
      { type: 'done', status: 'completed' },
    )
    state = streamReducer(state, { type: 'settle-failed' })
    expect(state.phase).toBe('completed')
    expect(state.settling).toBe(false)
    expect(state.settleFailed).toBe(true)
    expect(state.committedOutput).toBe('ab')
    expect(state.usage).toEqual({ tokensIn: 3, tokensOut: 4 })
  })

  it('settled 或新 start 清除 settleFailed', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'done', status: 'completed' },
      { type: 'settle-failed' },
    )
    expect(state.settleFailed).toBe(true)

    state = streamReducer(state, {
      type: 'settled',
      detail: makeDetail([makeIteration({ output: 'ab' })], 'ab'),
    })
    expect(state.settleFailed).toBe(false)

    state = streamReducer(state, { type: 'settle-failed' })
    expect(state.settleFailed).toBe(true)
    state = streamReducer(state, { type: 'start', recordId: 'rec-1', iterationId: 'it-2' })
    expect(state.settleFailed).toBe(false)
  })
})

describe('recoverTransportError', () => {
  it('已收到 done 时传输错误不再发任何终态（M7）', () => {
    expect(recoverTransportError({ sawDone: true, draftLength: 10, aborted: false })).toEqual({
      kind: 'none',
    })
    expect(recoverTransportError({ sawDone: true, draftLength: 0, aborted: false })).toEqual({
      kind: 'none',
    })
  })

  it('主动中断时保持 canceling 交给收尾', () => {
    expect(recoverTransportError({ sawDone: false, draftLength: 10, aborted: true })).toEqual({
      kind: 'none',
    })
  })

  it('未完成：有草稿按取消收尾，无草稿按 stream-closed 收尾', () => {
    expect(recoverTransportError({ sawDone: false, draftLength: 10, aborted: false })).toEqual({
      kind: 'done-canceled',
    })
    expect(recoverTransportError({ sawDone: false, draftLength: 0, aborted: false })).toEqual({
      kind: 'stream-closed',
    })
  })
})

describe('isRequestActive', () => {
  it('starting / streaming / canceling 为进行中', () => {
    const active: StreamPhase[] = ['starting', 'streaming', 'canceling']
    for (const phase of active) {
      expect(isRequestActive(phase)).toBe(true)
    }
  })

  it('idle / completed / canceled / failed 不是进行中', () => {
    const inactive: StreamPhase[] = ['idle', 'completed', 'canceled', 'failed']
    for (const phase of inactive) {
      expect(isRequestActive(phase)).toBe(false)
    }
  })
})

describe('unavailable 与 reset', () => {
  it('unavailable 只置位，不改变 idle 阶段；新 start 会清除它', () => {
    let state = streamReducer(initialStreamState, { type: 'unavailable' })
    expect(state.unavailable).toBe(true)
    expect(state.phase).toBe('idle')

    state = streamReducer(state, { type: 'start', recordId: 'rec-1', iterationId: 'it-1' })
    expect(state.unavailable).toBe(false)
  })

  it('reset 回到初始状态', () => {
    let state = apply(
      initialStreamState,
      { type: 'start', recordId: 'rec-1', iterationId: 'it-1' },
      { type: 'delta', text: 'ab' },
      { type: 'unavailable' },
    )
    state = streamReducer(state, { type: 'reset' })
    expect(state).toEqual(initialStreamState)
  })
})
