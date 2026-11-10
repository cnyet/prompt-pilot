import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MODEL_PRICING_CNY,
  classifyCallStatus,
  computeCostCny,
  instrumentProvider,
  mergePricingTable,
  parsePricingOverrides,
  recordLlmCall,
  resolveTraceId,
  summarizeCalls,
  type LlmCallStatsRow,
  type LlmCallStore,
  type LlmCallWrite,
} from '@/lib/llm/ledger'
import type {
  ChatChunk,
  ChatRequest,
  ChatResult,
  LLMProvider,
} from '@/lib/llm/types'

const PRO_MODEL = 'doubao-seed-2-1-pro-260915'

function request(): ChatRequest {
  return { modelConfigId: 'mock', messages: [{ role: 'user', content: 'hi' }] }
}

interface MemoryStore extends LlmCallStore {
  rows: LlmCallWrite[]
}

function memoryStore(): MemoryStore {
  const rows: LlmCallWrite[] = []
  return {
    rows,
    create: async (data) => {
      rows.push(data)
      return { id: `id-${rows.length}` }
    },
  }
}

interface FakeProviderOptions {
  chunks?: readonly ChatChunk[]
  chatResult?: ChatResult
  streamFailure?: unknown
  beforeStream?: () => void
  beforeChat?: () => void
}

function fakeProvider(options: FakeProviderOptions = {}): LLMProvider {
  return {
    id: 'mock',
    label: 'Mock',
    async chat(): Promise<ChatResult> {
      options.beforeChat?.()
      return (
        options.chatResult ?? {
          text: 'ok',
          finishReason: 'stop',
          usage: { tokensIn: 12, tokensOut: 4, cachedTokens: 0, reasoningTokens: 0 },
        }
      )
    },
    async *stream(): AsyncIterable<ChatChunk> {
      options.beforeStream?.()
      for (const chunk of options.chunks ?? []) {
        yield chunk
      }
      if (options.streamFailure !== undefined) {
        throw options.streamFailure
      }
    },
    async structured<T>(): Promise<T> {
      throw new Error('本用例不调用 structured')
    },
    async ping() {
      return { ok: true, latencyMs: 0 }
    },
  }
}

async function collect(
  provider: LLMProvider,
  signal?: AbortSignal,
): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = []
  const chatRequest: ChatRequest = {
    ...request(),
    ...(signal ? { signal } : {}),
  }
  for await (const chunk of provider.stream(chatRequest)) {
    chunks.push(chunk)
  }
  return chunks
}

describe('价格表', () => {
  it('按输入、缓存命中与输出分别计价，保留六位小数', () => {
    const cost = computeCostCny(
      { tokensIn: 1_000_000, tokensOut: 1_000_000, cachedTokens: 200_000 },
      DEFAULT_MODEL_PRICING_CNY[PRO_MODEL],
    )
    expect(cost).toBe(35.04)
  })

  it('缺少必要单价时返回 undefined，而不是 0', () => {
    expect(
      computeCostCny(
        { tokensIn: 100, tokensOut: 100 },
        { inputCnyPerMillion: 1 },
      ),
    ).toBeUndefined()
    expect(computeCostCny({ tokensIn: 100, tokensOut: 100 }, undefined)).toBeUndefined()
  })

  it('解析 AppSetting 覆盖，忽略非法条目并兼容简写', () => {
    const nested = parsePricingOverrides(
      JSON.stringify({
        models: {
          good: {
            inputCnyPerMillion: 2,
            outputCnyPerMillion: 4,
            cachedInputCnyPerMillion: 0.5,
          },
          negative: { inputCnyPerMillion: -1, outputCnyPerMillion: 4 },
          missingOutput: { inputCnyPerMillion: 1 },
        },
      }),
    )
    expect(nested).toEqual({
      good: {
        inputCnyPerMillion: 2,
        outputCnyPerMillion: 4,
        cachedInputCnyPerMillion: 0.5,
      },
    })

    const flat = parsePricingOverrides(
      JSON.stringify({
        flat: { inputCnyPerMillion: 1, outputCnyPerMillion: 2 },
      }),
    )
    expect(flat).toEqual({
      flat: { inputCnyPerMillion: 1, outputCnyPerMillion: 2 },
    })
    expect(parsePricingOverrides('not json')).toEqual({})
    expect(parsePricingOverrides(null)).toEqual({})
  })

  it('覆盖时保留默认表里的缓存价，避免部分覆盖清空字段', () => {
    const merged = mergePricingTable(DEFAULT_MODEL_PRICING_CNY, {
      [PRO_MODEL]: { inputCnyPerMillion: 3, outputCnyPerMillion: 15 },
    })
    expect(merged[PRO_MODEL]).toMatchObject({
      inputCnyPerMillion: 3,
      outputCnyPerMillion: 15,
      cachedInputCnyPerMillion: 1.2,
    })
    expect(merged.mock).toMatchObject({
      inputCnyPerMillion: 0,
      outputCnyPerMillion: 0,
    })
  })
})

describe('traceId', () => {
  it('从 requestId 派生，已带前缀时不重复拼接', () => {
    expect(resolveTraceId('abc')).toBe('trace_abc')
    expect(resolveTraceId('trace_abc')).toBe('trace_abc')
    expect(resolveTraceId('  ')).toMatch(/^trace_/)
  })

  it('没有 requestId 时由服务端生成', () => {
    expect(resolveTraceId(undefined, () => 'fixed')).toBe('trace_fixed')
    expect(resolveTraceId(null, () => 'fixed')).toBe('trace_fixed')
  })
})

describe('写入账本', () => {
  it('拿不到用量时全部写 null，而不是 0', async () => {
    const store = memoryStore()
    const id = await recordLlmCall(
      {
        traceId: 'trace_one',
        stage: 'compose',
        provider: 'mock',
        modelId: 'mock',
        status: 'succeeded',
      },
      { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
    )

    expect(id).toBe('id-1')
    expect(store.rows[0]).toMatchObject({
      traceId: 'trace_one',
      stage: 'compose',
      provider: 'mock',
      modelId: 'mock',
      status: 'succeeded',
      tokensIn: null,
      tokensOut: null,
      cachedTokens: null,
      reasoningTokens: null,
      costCny: null,
      attempts: 1,
    })
  })

  it('用量齐全时写入 token 明细与按价格表算出的金额', async () => {
    const store = memoryStore()
    await recordLlmCall(
      {
        traceId: 'trace_two',
        stage: 'compose',
        provider: 'ark',
        modelId: PRO_MODEL,
        usage: {
          tokensIn: 1000,
          tokensOut: 500,
          cachedTokens: 200,
          reasoningTokens: 100,
        },
        latencyMs: 123.4,
        ttftMs: 45.6,
        finishReason: 'length',
        lengthCause: 'max_tokens',
        attempts: 2,
      },
      { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
    )

    expect(store.rows[0]).toMatchObject({
      tokensIn: 1000,
      tokensOut: 500,
      cachedTokens: 200,
      reasoningTokens: 100,
      costCny: 0.02004,
      latencyMs: 123,
      ttftMs: 46,
      finishReason: 'length',
      lengthCause: 'max_tokens',
      attempts: 2,
    })
  })

  it('价格表缺该模型时接受 provider 已经算好的金额', async () => {
    const store = memoryStore()
    await recordLlmCall(
      {
        stage: 'evaluate',
        provider: 'openai_compatible',
        modelId: 'unknown-model',
        usage: { tokensIn: 10, tokensOut: 5, costCny: 0.5 },
      },
      { store, pricingTable: {} },
    )
    expect(store.rows[0]?.costCny).toBe(0.5)
  })

  it('写入失败只返回 null，不向调用方抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store: LlmCallStore = {
      create: async () => {
        throw new Error('db down')
      },
    }
    await expect(
      recordLlmCall(
        { stage: 'compose', provider: 'mock', modelId: 'mock' },
        { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
      ),
    ).resolves.toBeNull()
    warn.mockRestore()
  })
})

describe('取消与中断的区分', () => {
  it('正常结束且有完成信号是成功', () => {
    expect(
      classifyCallStatus({ sawContent: true, hasCompletionSignal: true }),
    ).toBe('succeeded')
  })

  it('还没流出内容就失败是 failed', () => {
    expect(
      classifyCallStatus({
        failure: new Error('boom'),
        sawContent: false,
        hasCompletionSignal: false,
      }),
    ).toBe('failed')
  })

  it('流出内容后上游断开是 interrupted', () => {
    expect(
      classifyCallStatus({
        failure: new Error('boom'),
        sawContent: true,
        hasCompletionSignal: false,
      }),
    ).toBe('interrupted')
  })

  it('客户端断开是 canceled', () => {
    const controller = new AbortController()
    controller.abort()
    expect(
      classifyCallStatus({
        signal: controller.signal,
        sawContent: true,
        hasCompletionSignal: false,
      }),
    ).toBe('canceled')
  })

  it('流正常结束却没有 finish_reason 与 usage 时归为 interrupted', () => {
    expect(
      classifyCallStatus({ sawContent: false, hasCompletionSignal: false }),
    ).toBe('interrupted')
  })
})

describe('provider 埋点', () => {
  it('流式调用记录首字延迟、用量、attempts 与成功状态', async () => {
    const store = memoryStore()
    let fetchCount = 0
    const wrapped = instrumentProvider(
      fakeProvider({
        chunks: [
          { delta: '你' },
          {
            delta: '好',
            finishReason: 'stop',
            usage: {
              tokensIn: 100,
              tokensOut: 50,
              cachedTokens: 20,
              reasoningTokens: 10,
            },
          },
        ],
        beforeStream: () => {
          fetchCount += 2
        },
      }),
      {
        traceId: 'trace_stream',
        stage: 'compose',
        provider: 'mock',
        modelId: 'mock',
        thinking: 'off',
        fetchAttempts: () => fetchCount,
        recordOptions: { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
      },
    )

    const chunks = await collect(wrapped)
    expect(chunks).toHaveLength(2)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({
      traceId: 'trace_stream',
      stage: 'compose',
      status: 'succeeded',
      tokensIn: 100,
      tokensOut: 50,
      cachedTokens: 20,
      reasoningTokens: 10,
      finishReason: 'stop',
      attempts: 2,
    })
    expect(store.rows[0]?.ttftMs).toBeTypeOf('number')
    expect(store.rows[0]?.latencyMs).toBeTypeOf('number')
  })

  it('客户端中断流时记为 canceled 并保留已收到的用量', async () => {
    const store = memoryStore()
    const controller = new AbortController()
    const wrapped = instrumentProvider(
      fakeProvider({
        chunks: [
          { delta: '半' },
          {
            delta: '段',
            finishReason: 'stop',
            usage: { tokensIn: 10, tokensOut: 2 },
          },
        ],
      }),
      {
        traceId: 'trace_cancel',
        stage: 'compose',
        provider: 'mock',
        modelId: 'mock',
        recordOptions: { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
      },
    )

    const chatRequest: ChatRequest = { ...request(), signal: controller.signal }
    for await (const chunk of wrapped.stream(chatRequest)) {
      expect(chunk.delta.length).toBeGreaterThan(0)
      controller.abort()
      break
    }

    expect(store.rows[0]).toMatchObject({
      status: 'canceled',
      errorCode: 'LLM_ABORTED',
    })
  })

  it('流中途抛错时记为 interrupted', async () => {
    const store = memoryStore()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const wrapped = instrumentProvider(
      fakeProvider({
        chunks: [{ delta: '半' }],
        streamFailure: new Error('upstream closed'),
      }),
      {
        traceId: 'trace_interrupt',
        stage: 'compose',
        provider: 'mock',
        modelId: 'mock',
        recordOptions: { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
      },
    )

    await expect(collect(wrapped)).rejects.toThrow('upstream closed')
    expect(store.rows[0]).toMatchObject({
      status: 'interrupted',
      errorCode: 'LLM_UNKNOWN',
    })
    warn.mockRestore()
  })

  it('非流式调用也能记录 attempts 与金额', async () => {
    const store = memoryStore()
    let fetchCount = 0
    const wrapped = instrumentProvider(
      fakeProvider({
        chatResult: {
          text: 'ok',
          finishReason: 'stop',
          usage: { tokensIn: 1000, tokensOut: 1000 },
        },
        beforeChat: () => {
          fetchCount += 3
        },
      }),
      {
        traceId: 'trace_chat',
        stage: 'compose',
        provider: 'ark',
        modelId: PRO_MODEL,
        fetchAttempts: () => fetchCount,
        recordOptions: { store, pricingTable: DEFAULT_MODEL_PRICING_CNY },
      },
    )

    const result = await wrapped.chat(request())
    expect(result.text).toBe('ok')
    expect(store.rows[0]).toMatchObject({
      status: 'succeeded',
      attempts: 3,
      costCny: 0.036,
      ttftMs: null,
    })
  })
})

describe('聚合', () => {
  it('null 不计入合计，状态与缓存命中率按已知数据计算', () => {
    const rows: LlmCallStatsRow[] = [
      {
        stage: 'compose',
        modelId: PRO_MODEL,
        status: 'succeeded',
        tokensIn: 1000,
        tokensOut: 500,
        cachedTokens: 200,
        reasoningTokens: 100,
        costCny: 0.02,
      },
      {
        stage: 'compose',
        modelId: PRO_MODEL,
        status: 'canceled',
        tokensIn: null,
        tokensOut: null,
        cachedTokens: null,
        reasoningTokens: null,
        costCny: null,
      },
      {
        stage: 'evaluate',
        modelId: 'lite',
        status: 'interrupted',
        tokensIn: 800,
        tokensOut: 300,
        cachedTokens: 0,
        reasoningTokens: 0,
        costCny: 0.001,
      },
    ]

    const summary = summarizeCalls(rows)
    expect(summary.total).toMatchObject({
      calls: 3,
      succeededCalls: 1,
      canceledCalls: 1,
      interruptedCalls: 1,
      failedCalls: 0,
      unknownUsageCalls: 1,
      unknownCostCalls: 1,
      tokensIn: 1800,
      tokensOut: 800,
      cachedTokens: 200,
      reasoningTokens: 100,
      costCny: 0.021,
    })
    expect(summary.total.cacheHitRate).toBeCloseTo((200 / 1800) * 100, 6)
    expect(summary.byStage).toHaveLength(2)
    expect(summary.byStage[0]?.key).toBe('compose')
    expect(summary.byModel).toHaveLength(2)
    expect(summary.byModel[0]?.key).toBe(PRO_MODEL)
  })

  it('空账本不伪造金额，缓存命中率为未知', () => {
    const summary = summarizeCalls([])
    expect(summary.total.calls).toBe(0)
    expect(summary.total.costCny).toBe(0)
    expect(summary.total.cacheHitRate).toBeNull()
    expect(summary.byStage).toEqual([])
    expect(summary.byModel).toEqual([])
  })

  it('全部没有价格时金额合计保持 0 且未知计数等于调用数', () => {
    const summary = summarizeCalls([
      {
        stage: 'compose',
        modelId: 'unknown',
        status: 'failed',
        tokensIn: null,
        tokensOut: null,
        cachedTokens: null,
        reasoningTokens: null,
        costCny: null,
      },
    ])
    expect(summary.total.costCny).toBe(0)
    expect(summary.total.unknownCostCalls).toBe(1)
    expect(summary.total.unknownUsageCalls).toBe(1)
    expect(summary.total.cacheHitRate).toBeNull()
  })
})
