import { describe, expect, it } from 'vitest'
import {
  formatCost,
  formatLatency,
  formatModel,
  formatTokens,
} from '@/components/studio-v3/format'

// 未知值统一显示「—」，不写 0；与 DESIGN 的未知值规则一致。

describe('formatModel', () => {
  it('未知模型显示 —', () => {
    expect(formatModel(null)).toBe('—')
    expect(formatModel(undefined)).toBe('—')
    expect(formatModel('')).toBe('—')
  })

  it('已知模型用显示名，未知 ID 原样显示', () => {
    expect(formatModel('deepseek-v4.1-flash')).toBe('DeepSeek V4.1 Flash')
    expect(formatModel('mock-valid')).toBe('mock-valid')
  })
})

describe('formatCost', () => {
  it('未知金额显示 —', () => {
    expect(formatCost(null)).toBe('—')
    expect(formatCost(undefined)).toBe('—')
    expect(formatCost(Number.NaN)).toBe('—')
  })

  it('已知金额固定四位小数', () => {
    expect(formatCost(0)).toBe('¥0.0000')
    expect(formatCost(0.01234)).toBe('¥0.0123')
    expect(formatCost(1.5)).toBe('¥1.5000')
  })
})

describe('formatLatency', () => {
  it('未知耗时显示 —', () => {
    expect(formatLatency(null)).toBe('—')
    expect(formatLatency(undefined)).toBe('—')
  })

  it('小于一秒用毫秒，一秒及以上用秒', () => {
    expect(formatLatency(999)).toBe('999 毫秒')
    expect(formatLatency(1000)).toBe('1.0 秒')
    expect(formatLatency(1500)).toBe('1.5 秒')
  })
})

describe('formatTokens', () => {
  it('未知 token 显示 —', () => {
    expect(formatTokens(null)).toBe('—')
    expect(formatTokens(undefined)).toBe('—')
  })

  it('已知 token 原样显示，0 是已知值', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1234)).toBe('1234')
  })
})
