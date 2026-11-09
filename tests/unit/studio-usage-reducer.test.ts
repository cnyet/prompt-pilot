import { describe, expect, it } from 'vitest'
import { FIELD_KEYS } from '@/lib/engine/schema'
import { generationReducer } from '@/components/studio/useGeneration'
import {
  createInitialState,
  formatUsageCost,
  formatUsageTokens,
  type GenerationState,
} from '@/components/studio/types'

function beginGeneration(): GenerationState {
  return generationReducer(createInitialState(), {
    type: 'begin',
    fields: FIELD_KEYS,
    full: true,
  })
}

describe('用量与思维链的界面状态', () => {
  it('usage 与 reasoning 只写各自字段，不进入提示词正文', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'reasoning', text: '先分析需求' })
    state = generationReducer(state, { type: 'reasoning', text: '，再写结构' })
    state = generationReducer(state, {
      type: 'usage',
      usage: {
        tokensIn: 812,
        tokensOut: 640,
        cachedTokens: 120,
        costCny: 0.054,
      },
    })

    expect(state.reasoning).toBe('先分析需求，再写结构')
    expect(state.usage).toEqual({
      tokensIn: 812,
      tokensOut: 640,
      cachedTokens: 120,
      costCny: 0.054,
    })

    for (const field of FIELD_KEYS) {
      expect(state.doc.fields[field]?.value ?? '').toBe('')
      expect(state.doc.pending[field] ?? '').toBe('')
    }
  })

  it('没有 usage 时保持 null，展示为「未知」而不是 0', () => {
    const state = beginGeneration()
    expect(state.usage).toBeNull()
    expect(formatUsageTokens(state.usage)).toBe('未知')
    expect(formatUsageCost(undefined)).toBe('未知')
    expect(formatUsageTokens(null)).not.toBe('输入 0 token · 输出 0 token')
  })

  it('用量的 token 与金额按人民币格式展示', () => {
    expect(
      formatUsageTokens({ tokensIn: 812, tokensOut: 640 }),
    ).toBe('输入 812 token · 输出 640 token')
    expect(
      formatUsageTokens({
        tokensIn: 812,
        tokensOut: 640,
        reasoningTokens: 30,
        cachedTokens: 10,
      }),
    ).toBe('输入 812 token · 输出 640 token · 思考 30 token · 缓存命中 10 token')
    expect(formatUsageCost(0.054)).toBe('¥0.054')
    expect(formatUsageCost(0)).toBe('¥0')
  })

  it('新的生成会清空上一次的用量与思考，完成与失败都保留本次结果', () => {
    let state = beginGeneration()
    state = generationReducer(state, { type: 'reasoning', text: '旧思考' })
    state = generationReducer(state, {
      type: 'usage',
      usage: { tokensIn: 1, tokensOut: 2, costCny: 0.001 },
    })

    state = generationReducer(state, {
      type: 'begin',
      fields: FIELD_KEYS,
      full: false,
    })
    expect(state.usage).toBeNull()
    expect(state.reasoning).toBe('')

    state = generationReducer(state, { type: 'reasoning', text: '本次思考' })
    state = generationReducer(state, {
      type: 'usage',
      usage: { tokensIn: 3, tokensOut: 4 },
    })
    state = generationReducer(state, {
      type: 'done',
      title: '测试标题',
      assumptions: [],
      durationMs: 1200,
      finishReason: 'stop',
    })

    expect(state.reasoning).toBe('本次思考')
    expect(state.usage).toEqual({ tokensIn: 3, tokensOut: 4 })
  })
})
