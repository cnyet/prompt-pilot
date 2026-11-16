import { describe, expect, it } from 'vitest'
import { WORKSPACE_NAV } from '@/lib/ui/nav'
import { t } from '@/lib/i18n/zh'

describe('WORKSPACE_NAV', () => {
  it('四项按固定顺序指向工作区路由', () => {
    expect(WORKSPACE_NAV.map((item) => item.href)).toEqual([
      '/studio',
      '/library',
      '/templates',
      '/settings',
    ])
    expect(WORKSPACE_NAV).toHaveLength(4)
  })

  it('不再包含评估入口', () => {
    expect(WORKSPACE_NAV.some((item) => item.href === '/eval')).toBe(false)
  })

  it('文案键经 zh 字典解析为四项中文导航名', () => {
    expect(WORKSPACE_NAV.map((item) => t(item.labelKey))).toEqual([
      '工作台',
      '提示词库',
      '模板',
      '设置',
    ])
  })

  it('href 唯一且每项带图标', () => {
    expect(new Set(WORKSPACE_NAV.map((item) => item.href)).size).toBe(4)
    expect(WORKSPACE_NAV.map((item) => item.icon)).toEqual([
      'studio',
      'library',
      'template',
      'settings',
    ])
  })
})
