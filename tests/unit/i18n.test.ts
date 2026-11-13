import { describe, expect, it } from 'vitest'
import { zh, t, type MessageKey } from '@/lib/i18n/zh'

const REQUIRED_KEYS = [
  'common.unknown',
  'common.copy',
  'common.copied',
  'common.download',
  'common.cancel',
  'common.retry',
  'common.close',
  'common.unrated',
  'rating.label',
  'rating.clear',
  'rating.starAria',
  'download.defaultTitle',
  'error.network',
  'error.requestFailed',
  'error.noModel',
  'error.inFlight',
  'error.notReady',
] as const satisfies readonly MessageKey[]

describe('i18n 字典', () => {
  it('核心键值稳定', () => {
    expect(zh['common.unknown']).toBe('—')
    expect(zh['common.unrated']).toBe('未评分')
    expect(t('common.unknown')).toBe('—')
    expect(t('common.unrated')).toBe('未评分')
  })

  it('包含初始键且值非空', () => {
    for (const key of REQUIRED_KEYS) {
      expect(zh[key].length, key).toBeGreaterThan(0)
    }
  })

  it('插值替换参数，缺参保留占位符', () => {
    expect(t('rating.starAria', { value: 3 })).toBe('3 星')
    expect(t('rating.starAria')).toBe('{value} 星')
    expect(t('rating.starAria', { other: 'x' })).toBe('{value} 星')
  })

  it('中文文案不含感叹号与 emoji，em dash 只用于未知值', () => {
    for (const [key, value] of Object.entries(zh)) {
      const stripped = value.replace(/—/g, '')
      expect(stripped, key).not.toContain('—')
      expect(stripped, key).not.toContain('!')
      expect(stripped, key).not.toContain('！')
      expect(/\p{Extended_Pictographic}/u.test(value), key).toBe(false)
    }
  })
})
