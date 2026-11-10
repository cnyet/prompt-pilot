import { describe, expect, it } from 'vitest'
import { clampRatio } from '@/components/ui/MeterBar'

describe('MeterBar 比例计算', () => {
  it('把值压到 0-1', () => {
    expect(clampRatio(0.5)).toBe(0.5)
    expect(clampRatio(2)).toBe(1)
    expect(clampRatio(-1)).toBe(0)
  })

  it('支持自定义上限', () => {
    expect(clampRatio(5, 10)).toBe(0.5)
    expect(clampRatio(15, 10)).toBe(1)
  })

  it('非有限值与非法上限一律按 0，不产出 NaN 宽度', () => {
    expect(clampRatio(Number.NaN)).toBe(0)
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampRatio(1, 0)).toBe(0)
    expect(clampRatio(1, -5)).toBe(0)
  })
})
