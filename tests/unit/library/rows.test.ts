import { describe, expect, it } from 'vitest'
import {
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
