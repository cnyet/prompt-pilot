import { describe, expect, it } from 'vitest'
import { copyText } from '@/lib/clipboard'
import { downloadMarkdown, safeMarkdownFilename } from '@/lib/download'

describe('safeMarkdownFilename', () => {
  it('非法字符替换为短横线并去掉两侧空格', () => {
    expect(safeMarkdownFilename('周报 / 2026')).toBe('周报-2026.md')
    expect(safeMarkdownFilename('a:b*c?')).toBe('a-b-c.md')
  })

  it('空白标题回落到默认标题', () => {
    expect(safeMarkdownFilename('   ')).toBe('提示词.md')
  })

  it('超长标题截断到 80 字符再加扩展名', () => {
    expect(safeMarkdownFilename('x'.repeat(120))).toHaveLength(83)
  })

  it('去掉首尾的连字符与点', () => {
    expect(safeMarkdownFilename('...周报---')).toBe('周报.md')
  })
})

describe('copyText', () => {
  it('自定义 writer 成功时返回 true', async () => {
    let written = ''
    await expect(
      copyText('abc', async (value) => {
        written = value
      }),
    ).resolves.toBe(true)
    expect(written).toBe('abc')
  })

  it('writer 抛错且无 DOM 时返回 false', async () => {
    await expect(
      copyText('abc', async () => {
        throw new Error('denied')
      }),
    ).resolves.toBe(false)
  })

  it('无 writer 且无 DOM 时返回 false', async () => {
    await expect(copyText('abc')).resolves.toBe(false)
  })
})

describe('downloadMarkdown', () => {
  it('无 DOM 环境返回 false', () => {
    expect(downloadMarkdown('# 提示词', '周报 / 2026')).toBe(false)
  })
})
