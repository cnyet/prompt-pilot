import { describe, expect, it } from 'vitest'
import {
  PromptStoreError,
  assertVersionWritable,
  isPromptVersionOrigin,
  normalizePromptTitle,
} from '@/lib/db/prompts'

describe('版本来源白名单', () => {
  it('接受工单要求的五种来源与 schema 中已有的 ai_refined', () => {
    for (const origin of [
      'user_input',
      'ai_generated',
      'ai_refined',
      'human_edited',
      'imported',
      'rollback',
    ]) {
      expect(isPromptVersionOrigin(origin)).toBe(true)
    }
  })

  it('拒绝未知来源', () => {
    expect(isPromptVersionOrigin('manual')).toBe(false)
    expect(isPromptVersionOrigin('')).toBe(false)
    expect(isPromptVersionOrigin(null)).toBe(false)
  })
})

describe('基线 v0 的写保护', () => {
  it('任何对 versionNo 0 的写操作都抛出 409', () => {
    try {
      assertVersionWritable(0)
      throw new Error('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(PromptStoreError)
      if (error instanceof PromptStoreError) {
        expect(error.status).toBe(409)
        expect(error.code).toBe('BASELINE_IMMUTABLE')
        expect(error.detail).toEqual({ versionNo: 0 })
      }
    }
  })

  it('非基线版本可以写入', () => {
    expect(() => assertVersionWritable(1)).not.toThrow()
    expect(() => assertVersionWritable(12)).not.toThrow()
  })
})

describe('标题归一化', () => {
  it('优先使用显式标题并压缩空白', () => {
    expect(normalizePromptTitle('  周报   助手 ', '帮我写个周报')).toBe('周报 助手')
  })

  it('没有标题时取原始需求首行', () => {
    expect(normalizePromptTitle(undefined, '  帮我写个周报\n要包含三条进展  ')).toBe(
      '帮我写个周报',
    )
  })

  it('空输入回落到未命名', () => {
    expect(normalizePromptTitle('   ', '   ')).toBe('未命名提示词')
  })

  it('超长标题截断到 80 字', () => {
    const title = normalizePromptTitle(undefined, '标题'.repeat(60))
    expect(title).toHaveLength(80)
  })
})
