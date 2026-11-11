import { describe, expect, it } from 'vitest'
import { findSceneTemplate, SCENE_TEMPLATES } from '@/lib/templates'

describe('场景模板登记表', () => {
  it('id 唯一且都有可用的示例需求', () => {
    const ids = SCENE_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of SCENE_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(template.sample.trim().length).toBeGreaterThan(0)
    }
  })

  it('按 id 能找到对应模板', () => {
    for (const template of SCENE_TEMPLATES) {
      expect(findSceneTemplate(template.id)).toBe(template)
    }
  })

  it('未知 id、重复参数与缺省一律返回 null', () => {
    expect(findSceneTemplate(undefined)).toBeNull()
    expect(findSceneTemplate('')).toBeNull()
    expect(findSceneTemplate('unknown')).toBeNull()
    expect(findSceneTemplate(['content', 'code'])).toBeNull()
  })
})