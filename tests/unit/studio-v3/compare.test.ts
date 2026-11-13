import { describe, expect, it } from 'vitest'
import {
  defaultCompareSelection,
  isOriginalCompareAvailable,
  ORIGINAL_COMPARE_ID,
  showCompareView,
} from '@/lib/ui/compare'

describe('isOriginalCompareAvailable', () => {
  it('优化记录且有非空原文时为 true', () => {
    expect(isOriginalCompareAvailable('optimize', '原文')).toBe(true)
  })

  it('生成记录或空白原文时为 false', () => {
    expect(isOriginalCompareAvailable('generate', '原文')).toBe(false)
    expect(isOriginalCompareAvailable('optimize', '')).toBe(false)
    expect(isOriginalCompareAvailable('optimize', ' \n ')).toBe(false)
  })
})

describe('showCompareView', () => {
  it('两轮及以上迭代总是显示', () => {
    expect(showCompareView('generate', '', 2)).toBe(true)
    expect(showCompareView('generate', '', 3)).toBe(true)
    expect(showCompareView('optimize', '', 2)).toBe(true)
  })

  it('单轮优化记录带原文时显示', () => {
    expect(showCompareView('optimize', '原始提示词', 1)).toBe(true)
    expect(showCompareView('optimize', '原始提示词', 0)).toBe(true)
  })

  it('单轮生成记录或原文为空时不显示', () => {
    expect(showCompareView('generate', '一句话需求', 1)).toBe(false)
    expect(showCompareView('optimize', '', 1)).toBe(false)
    expect(showCompareView('optimize', '  ', 1)).toBe(false)
    expect(showCompareView('generate', '', 0)).toBe(false)
  })
})

describe('defaultCompareSelection', () => {
  it('单轮且有原文时 FROM 默认原文，TO 为该轮', () => {
    expect(defaultCompareSelection(['i1'], true)).toEqual({
      fromId: ORIGINAL_COMPARE_ID,
      toId: 'i1',
    })
  })

  it('单轮且无原文时 FROM 回落到该轮，TO 为该轮', () => {
    expect(defaultCompareSelection(['i1'], false)).toEqual({
      fromId: 'i1',
      toId: 'i1',
    })
  })

  it('两轮及以上默认上一轮 vs 当前轮，原文可用也不改变默认', () => {
    expect(defaultCompareSelection(['i1', 'i2'], false)).toEqual({
      fromId: 'i1',
      toId: 'i2',
    })
    expect(defaultCompareSelection(['i1', 'i2', 'i3'], true)).toEqual({
      fromId: 'i2',
      toId: 'i3',
    })
  })

  it('没有迭代时原文可用则 FROM 为原文，否则为空', () => {
    expect(defaultCompareSelection([], true)).toEqual({
      fromId: ORIGINAL_COMPARE_ID,
      toId: '',
    })
    expect(defaultCompareSelection([], false)).toEqual({
      fromId: '',
      toId: '',
    })
  })

  it('纯函数，不修改入参数组', () => {
    const ids = ['i1', 'i2']
    defaultCompareSelection(ids, true)
    expect(ids).toEqual(['i1', 'i2'])
  })
})
