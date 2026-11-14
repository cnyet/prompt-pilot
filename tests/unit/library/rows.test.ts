import { describe, expect, it } from 'vitest'
import {
  applyMetaUpdate,
  patchRecordInList,
  removeRecordFromList,
  replaceRecord,
} from '@/lib/library/rows'
import type { RecordSummaryDto } from '@/components/studio-v3/api'

const base: RecordSummaryDto = {
  id: 'r1', title: '周报', mode: 'generate', targetType: 'text',
  sourceInput: '帮我写个周报', status: 'completed', favorite: false,
  rating: null, modelId: 'mock', iterationCount: 1,
  tokensIn: 10, tokensOut: 20, costCny: null,
  createdAt: '2026-11-13T00:00:00.000Z', updatedAt: '2026-11-13T00:00:00.000Z',
}

describe('列表纯更新', () => {
  it('替换保持顺序', () => {
    const next = { ...base, title: '新标题' }
    expect(replaceRecord([base], next)).toEqual([next])
  })

  it('按 id 局部更新，不存在的 id 原样返回', () => {
    expect(patchRecordInList([base], 'r1', { favorite: true })[0]?.favorite).toBe(true)
    expect(patchRecordInList([base], 'missing', { favorite: true })).toEqual([base])
  })

  it('删除移除指定行', () => {
    expect(removeRecordFromList([base], 'r1')).toEqual([])
    expect(removeRecordFromList([base], 'missing')).toEqual([base])
  })
})

describe('筛选归属更新', () => {
  it('收藏筛选下取消收藏后移除该行并递减总数', () => {
    const before = { ...base, favorite: true }
    const next = { ...before, favorite: false }
    expect(
      applyMetaUpdate(
        { records: [before], total: 3, offset: 1 },
        next,
        'favorite',
      ),
    ).toEqual({ records: [], total: 2, offset: 0 })
  })

  it('已评分筛选下清除评分后移除该行并递减总数', () => {
    const before = { ...base, rating: 4 }
    const next = { ...before, rating: null }
    expect(
      applyMetaUpdate({ records: [before], total: 1, offset: 1 }, next, 'rated'),
    ).toEqual({ records: [], total: 0, offset: 0 })
  })

  it('全部筛选下取消收藏只就地替换，不移除', () => {
    const before = { ...base, favorite: true }
    const next = { ...before, favorite: false }
    expect(
      applyMetaUpdate({ records: [before], total: 1, offset: 1 }, next, 'all'),
    ).toEqual({ records: [next], total: 1, offset: 1 })
  })

  it('生成筛选下评分变化就地替换', () => {
    const next = { ...base, rating: 3 }
    expect(
      applyMetaUpdate(
        { records: [base], total: 1, offset: 1 },
        next,
        'generate',
      ),
    ).toEqual({ records: [next], total: 1, offset: 1 })
  })

  it('不在列表中的记录原样返回', () => {
    const next = { ...base, id: 'missing' }
    const snapshot = { records: [base], total: 1, offset: 1 }
    expect(applyMetaUpdate(snapshot, next, 'favorite')).toBe(snapshot)
  })

  it('总数与已加载数量不会降到 0 以下', () => {
    expect(
      applyMetaUpdate({ records: [base], total: 0, offset: 0 }, base, 'favorite'),
    ).toEqual({ records: [], total: 0, offset: 0 })
  })
})
