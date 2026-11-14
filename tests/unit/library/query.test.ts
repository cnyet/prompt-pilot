import { describe, expect, it } from 'vitest'
import {
  buildRecordsQuery,
  hasActiveQuery,
  nextOffset,
  LIBRARY_PAGE_SIZE,
} from '@/lib/library/query'

describe('buildRecordsQuery', () => {
  it('默认参数只带 filter 与分页', () => {
    const query = buildRecordsQuery({
      q: '',
      filter: 'all',
      targetType: null,
      from: null,
      to: null,
      limit: LIBRARY_PAGE_SIZE,
      offset: 0,
    })
    const url = new URL(query, 'http://local')
    expect(url.pathname).toBe('/api/records')
    expect(url.searchParams.get('filter')).toBe('all')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('offset')).toBe('0')
    expect(url.searchParams.has('q')).toBe(false)
    expect(url.searchParams.has('targetType')).toBe(false)
    expect(url.searchParams.has('from')).toBe(false)
    expect(url.searchParams.has('to')).toBe(false)
  })

  it('带 q、目标类型与日期范围时全部编码', () => {
    const url = new URL(
      buildRecordsQuery({
        q: '周报 & 总结',
        filter: 'favorite',
        targetType: 'image',
        from: '2026-11-01',
        to: '2026-11-13',
        limit: 20,
        offset: 40,
      }),
      'http://local',
    )
    expect(url.searchParams.get('q')).toBe('周报 & 总结')
    expect(url.searchParams.get('filter')).toBe('favorite')
    expect(url.searchParams.get('targetType')).toBe('image')
    expect(url.searchParams.get('from')).toBe('2026-11-01')
    expect(url.searchParams.get('to')).toBe('2026-11-13')
    expect(url.searchParams.get('offset')).toBe('40')
  })
})

describe('hasActiveQuery', () => {
  it('默认状态没有筛选', () => {
    expect(
      hasActiveQuery({ q: '', filter: 'all', targetType: null, from: null, to: null }),
    ).toBe(false)
  })

  it('任一条件存在即视为有筛选', () => {
    expect(
      hasActiveQuery({ q: '周报', filter: 'all', targetType: null, from: null, to: null }),
    ).toBe(true)
    expect(
      hasActiveQuery({ q: '', filter: 'rated', targetType: null, from: null, to: null }),
    ).toBe(true)
    expect(
      hasActiveQuery({ q: '', filter: 'all', targetType: 'video', from: null, to: null }),
    ).toBe(true)
    expect(
      hasActiveQuery({ q: '', filter: 'all', targetType: null, from: '2026-11-01', to: null }),
    ).toBe(true)
  })
})

describe('nextOffset', () => {
  it('按已加载条数递增', () => {
    expect(nextOffset(0, 20)).toBe(20)
    expect(nextOffset(20, 5)).toBe(25)
  })
})
