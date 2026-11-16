import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MODEL_PRICING_CNY,
  classifyCallStatus,
  computeCostCny,
  mergePricingTable,
  parsePricingOverrides,
  recordLlmCall,
  resolveTraceId,
  summarizeCalls,
  type LlmCallStatsRow,
  type LlmCallStore,
  type LlmCallWrite,
} from '@/lib/llm/ledger'
import type { ChatRequest } from '@/lib/llm/types'

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

  it('近 14 天按上海时区切日，未知金额不计入当日金额', () => {
    const base = {
      stage: 'compose',
      modelId: 'mock',
      status: 'succeeded',
      tokensIn: 10,
      tokensOut: 5,
      cachedTokens: null,
      reasoningTokens: null,
    }
    const summary = summarizeCalls(
      [
        { ...base, costCny: 0.02, createdAt: '2026-11-11T02:00:00Z' },
        { ...base, costCny: null, createdAt: '2026-11-10T20:00:00Z' },
        { ...base, costCny: 0.5, createdAt: '2026-10-01T02:00:00Z' },
      ],
      new Date('2026-11-11T04:00:00Z'),
    )

    expect(summary.daily).toHaveLength(14)
    const today = summary.daily[summary.daily.length - 1]
    expect(today?.date).toBe('2026-11-11')
    expect(today?.calls).toBe(2)
    expect(today?.knownCostCalls).toBe(1)
    expect(today?.unknownCostCalls).toBe(1)
    expect(today?.costCny).toBe(0.02)
    expect(summary.daily.find((day) => day.date === '2026-11-10')?.calls).toBe(0)
    expect(summary.daily.some((day) => day.date === '2026-10-01')).toBe(false)
    // 总额仍统计窗口外的历史调用。
    expect(summary.total.calls).toBe(3)
    expect(summary.total.costCny).toBe(0.52)
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
