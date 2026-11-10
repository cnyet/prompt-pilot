import { describe, expect, it, vi } from 'vitest'
import {
  createInitialTrialRunState,
  estimateTokens,
  estimateTrialUsage,
  parseTrialRunAvailability,
  trialRunReducer,
} from '@/components/studio/useTrialRun'
import { formatUsageTokens } from '@/components/studio/types'
import { buildRunWrite, recordRun, type RunWriteInput } from '@/lib/db/runs'

function streamingState() {
  let state = createInitialTrialRunState()
  state = trialRunReducer(state, {
    type: 'start',
    modelLabel: 'Mock 模型 · valid',
  })
  state = trialRunReducer(state, {
    type: 'reasoning',
    text: '先读变量，再回答。',
  })
  state = trialRunReducer(state, { type: 'delta', text: '这是' })
  state = trialRunReducer(state, { type: 'delta', text: '已经流出的内容。' })
  state = trialRunReducer(state, {
    type: 'usage',
    usage: { tokensIn: 48, tokensOut: 12, costCny: 0 },
  })
  return state
}

describe('试运行状态机', () => {
  it('delta、reasoning 与 usage 各写自己的字段', () => {
    const state = streamingState()
    expect(state.phase).toBe('running')
    expect(state.output).toBe('这是已经流出的内容。')
    expect(state.reasoning).toBe('先读变量，再回答。')
    expect(state.usage).toEqual({ tokensIn: 48, tokensOut: 12, costCny: 0 })
    expect(state.modelLabel).toBe('Mock 模型 · valid')
  })

  it('取消后保留已输出内容，并忽略迟到的 delta 与 done', () => {
    let state = streamingState()
    state = trialRunReducer(state, { type: 'cancel', durationMs: 860 })

    expect(state.phase).toBe('canceled')
    expect(state.output).toBe('这是已经流出的内容。')
    expect(state.reasoning).toBe('先读变量，再回答。')
    expect(state.durationMs).toBe(860)

    state = trialRunReducer(state, { type: 'delta', text: '迟到的内容' })
    state = trialRunReducer(state, {
      type: 'usage',
      usage: { tokensIn: 999, tokensOut: 999 },
    })
    state = trialRunReducer(state, {
      type: 'finish',
      durationMs: 2000,
      finishReason: 'stop',
    })

    expect(state.phase).toBe('canceled')
    expect(state.output).toBe('这是已经流出的内容。')
    expect(state.usage).toEqual({ tokensIn: 48, tokensOut: 12, costCny: 0 })
  })

  it('失败也保留已输出内容，失败后的取消不改状态', () => {
    let state = streamingState()
    state = trialRunReducer(state, {
      type: 'fail',
      message: '模型连接提前结束，已保留收到的内容。',
      durationMs: 1200,
    })
    expect(state.phase).toBe('failed')
    expect(state.output).toBe('这是已经流出的内容。')
    expect(state.error).toContain('已保留')

    state = trialRunReducer(state, {
      type: 'finish',
      durationMs: 1300,
      finishReason: 'stop',
    })
    expect(state.phase).toBe('failed')
    expect(state.error).toContain('已保留')

    state = trialRunReducer(state, { type: 'cancel', durationMs: 1300 })
    expect(state.phase).toBe('failed')
  })

  it('完成、错误完成与中止完成分别落到 done / failed / canceled', () => {
    const done = trialRunReducer(streamingState(), {
      type: 'finish',
      durationMs: 1500,
      finishReason: 'stop',
    })
    expect(done.phase).toBe('done')
    expect(done.finishReason).toBe('stop')

    const failed = trialRunReducer(streamingState(), {
      type: 'finish',
      durationMs: 900,
      finishReason: 'error',
    })
    expect(failed.phase).toBe('failed')

    const aborted = trialRunReducer(streamingState(), {
      type: 'finish',
      durationMs: 700,
      finishReason: 'aborted',
    })
    expect(aborted.phase).toBe('canceled')
  })

  it('新的运行会清空上一次的输出、用量与错误', () => {
    let state = streamingState()
    state = trialRunReducer(state, {
      type: 'fail',
      message: '上一次失败',
      durationMs: 500,
    })
    state = trialRunReducer(state, {
      type: 'start',
      modelLabel: '方舟生成模型',
    })
    expect(state.phase).toBe('running')
    expect(state.output).toBe('')
    expect(state.reasoning).toBe('')
    expect(state.usage).toBeNull()
    expect(state.error).toBeNull()
    expect(state.modelLabel).toBe('方舟生成模型')
  })

  it('没有 usage 时保持 null，界面显示未知而不是 0', () => {
    const state = createInitialTrialRunState()
    expect(state.usage).toBeNull()
    expect(formatUsageTokens(state.usage)).toBe('未知')
    expect(formatUsageTokens(null)).toBe('未知')
  })
})

describe('运行中的粗略估算', () => {
  it('按字符数估算 token，空文本为 0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abc')).toBe(2)
    expect(estimateTokens('abcd')).toBe(3)
  })

  it('有价格时估算金额，缺价格时只给 token', () => {
    const estimate = estimateTrialUsage('123456', 'abc', {
      inputCnyPerMillion: 6,
      outputCnyPerMillion: 30,
    })
    expect(estimate).toEqual({
      tokensIn: 4,
      tokensOut: 2,
      costCny: 0.000084,
    })

    expect(estimateTrialUsage('123456', 'abc', undefined)).toEqual({
      tokensIn: 4,
      tokensOut: 2,
    })
    expect(
      estimateTrialUsage('123456', 'abc', { inputCnyPerMillion: 6 }),
    ).toEqual({ tokensIn: 4, tokensOut: 2 })
  })
})

describe('可用性响应解析', () => {
  it('解析可用模型、价格与最近运行', () => {
    const parsed = parseTrialRunAvailability({
      available: true,
      reason: '',
      model: {
        providerId: 'mock',
        modelId: 'mock',
        label: 'Mock 模型 · valid',
        pricing: {
          inputCnyPerMillion: 0,
          outputCnyPerMillion: 0,
          cachedInputCnyPerMillion: 0,
        },
      },
      runs: [
        {
          id: 'run_1',
          status: 'succeeded',
          output: '输出',
          reasoning: null,
          latencyMs: 820,
          tokensIn: 12,
          tokensOut: 8,
          costCny: 0,
          createdAt: '2026-11-10T10:00:00.000Z',
          errorCode: null,
          errorMsg: null,
        },
      ],
    })
    expect(parsed?.availability).toMatchObject({
      status: 'ready',
      available: true,
    })
    expect(parsed?.availability.model?.pricing?.inputCnyPerMillion).toBe(0)
    expect(parsed?.runs).toHaveLength(1)
    expect(parsed?.runs[0]?.status).toBe('succeeded')
  })

  it('不可用与格式错误分别处理', () => {
    const unavailable = parseTrialRunAvailability({
      available: false,
      reason: '没有可用模型。',
      model: null,
      runs: [],
    })
    expect(unavailable?.availability.status).toBe('unavailable')
    expect(unavailable?.availability.available).toBe(false)
    expect(unavailable?.availability.reason).toBe('没有可用模型。')

    expect(parseTrialRunAvailability({ model: null })).toBeNull()
    expect(parseTrialRunAvailability(null)).toBeNull()
  })
})

describe('运行落库字段', () => {
  const base: RunWriteInput = {
    sessionKey: 'draft_1',
    variablesJson: JSON.stringify({ topic: '秋季新品' }),
    modelId: 'mock',
    paramsJson: JSON.stringify({ temperature: 0.7, maxTokens: 4096 }),
    output: '已经流出的部分',
    reasoning: '先读变量',
    status: 'canceled',
    errorCode: 'CANCELED',
    errorMsg: '用户取消了本次试运行。',
    latencyMs: 321.6,
    usage: { tokensIn: 12, tokensOut: 3, costCny: 0.001 },
    finishReason: 'aborted',
    traceId: 'trace_run_1',
    requestId: 'run_1',
    cacheKey: 'draft_1',
  }

  it('取消也保留输出、用量与状态，耗时取整', () => {
    const write = buildRunWrite(base)
    expect(write).toMatchObject({
      sessionKey: 'draft_1',
      status: 'canceled',
      output: '已经流出的部分',
      reasoning: '先读变量',
      errorCode: 'CANCELED',
      latencyMs: 322,
      tokensIn: 12,
      tokensOut: 3,
      costCny: 0.001,
      finishReason: 'aborted',
      requestId: 'run_1',
    })
    expect(write.versionId).toBeUndefined()
  })

  it('用量未知时落 null，不用 0 或哨兵值冒充', () => {
    const write = buildRunWrite({
      ...base,
      usage: undefined,
      status: 'failed',
      errorCode: 'LLM_NETWORK',
      errorMsg: '网络错误。',
    })
    // null 表示「不知道」；0 表示「确实是 0」，两者不能混
    expect(write.tokensIn).toBeNull()
    expect(write.tokensOut).toBeNull()
    expect(write.cachedTokens).toBeNull()
    expect(write.reasoningTokens).toBeNull()
    expect(write.costCny).toBeNull()
    expect(write.status).toBe('failed')
  })

  it('存储失败时只告警并返回 null，不影响主流程', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const id = await recordRun(base, {
      store: {
        create: async () => {
          throw new Error('database is down')
        },
      },
    })
    expect(id).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('没有存储时直接返回 null', async () => {
    const id = await recordRun(base, { store: null })
    expect(id).toBeNull()
  })
})
