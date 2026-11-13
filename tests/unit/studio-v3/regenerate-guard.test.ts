import { describe, expect, it } from 'vitest'
import { canRegenerateRecord } from '@/components/studio-v3/regenerate-guard'

// 重新生成守卫（I3、M11）：只开放给生成模式记录；请求进行中与结算期间都拒绝。

const base = {
  recordId: 'rec-1',
  active: false,
  settling: false,
  generateAvailable: true,
  mode: 'generate' as const,
}

describe('canRegenerateRecord', () => {
  it('生成模式记录且空闲时可用', () => {
    expect(canRegenerateRecord(base)).toBe(true)
  })

  it('优化模式记录不可用（I3：不走生成管线）', () => {
    expect(canRegenerateRecord({ ...base, mode: 'optimize' })).toBe(false)
  })

  it('请求进行中不可用', () => {
    expect(canRegenerateRecord({ ...base, active: true })).toBe(false)
  })

  it('结算期间不可用（M11）', () => {
    expect(canRegenerateRecord({ ...base, settling: true })).toBe(false)
  })

  it('没有记录或没有生成模型时不可用', () => {
    expect(canRegenerateRecord({ ...base, recordId: null })).toBe(false)
    expect(canRegenerateRecord({ ...base, generateAvailable: false })).toBe(false)
  })
})
