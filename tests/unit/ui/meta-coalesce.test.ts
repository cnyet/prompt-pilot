import { describe, expect, it } from 'vitest'
import { patchAgainstConfirmed, queueMetaPatch } from '@/lib/ui/meta-coalesce'

// 收藏与评分乐观写合并（I1）：PATCH 在途时最新请求值入队，落定后按差异补发。

describe('queueMetaPatch', () => {
  it('空队列直接采用请求值', () => {
    expect(queueMetaPatch(null, { favorite: true })).toEqual({ favorite: true })
    expect(queueMetaPatch(null, { rating: 4 })).toEqual({ rating: 4 })
  })

  it('同一字段以最新值为准', () => {
    const queued = queueMetaPatch({ rating: 2 }, { rating: 4 })
    expect(queued).toEqual({ rating: 4 })
  })

  it('不同字段合并进同一次补发', () => {
    const queued = queueMetaPatch({ favorite: true }, { rating: 3 })
    expect(queued).toEqual({ favorite: true, rating: 3 })
  })
})

describe('patchAgainstConfirmed', () => {
  it('与已确认值不同才发送', () => {
    expect(
      patchAgainstConfirmed({ favorite: true }, { favorite: false, rating: null }),
    ).toEqual({ favorite: true })
  })

  it('与已确认值相同则返回 null，跳过无意义补发', () => {
    expect(
      patchAgainstConfirmed({ rating: 4 }, { favorite: false, rating: 4 }),
    ).toBeNull()
    expect(
      patchAgainstConfirmed({ favorite: true, rating: 4 }, { favorite: true, rating: 4 }),
    ).toBeNull()
  })

  it('混合差异只发有变化的字段', () => {
    expect(
      patchAgainstConfirmed(
        { favorite: true, rating: 2 },
        { favorite: true, rating: 5 },
      ),
    ).toEqual({ rating: 2 })
  })
})
