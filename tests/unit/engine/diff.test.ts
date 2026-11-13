import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  diffPromptLines,
  type DiffResult,
} from '@/lib/engine/diff'
import { DiffView } from '@/components/studio-v3/DiffView'

const kinds = (result: DiffResult) => result.rows.map((row) => row.kind)

describe('diffPromptLines', () => {
  it('相同输入全部为 same', () => {
    const same = diffPromptLines('a\nb', 'a\nb')
    expect(kinds(same)).toEqual(['same', 'same'])
    expect(same.stats).toEqual({ added: 0, removed: 0, modified: 0 })
    expect(same.degraded).toBe(false)
  })

  it('新增与删除行', () => {
    const added = diffPromptLines('a', 'a\nb')
    expect(kinds(added)).toEqual(['same', 'add'])
    expect(added.stats.added).toBe(1)

    const removed = diffPromptLines('a\nb', 'a')
    expect(kinds(removed)).toEqual(['same', 'remove'])
    expect(removed.stats.removed).toBe(1)
  })

  it('相似行合并为 modify 并带字符级片段', () => {
    const result = diffPromptLines('请简洁一点', '请详细一点')
    expect(kinds(result)).toEqual(['modify'])
    expect(result.stats).toEqual({ added: 0, removed: 0, modified: 1 })

    const row = result.rows[0]
    expect(row?.before).toBe('请简洁一点')
    expect(row?.after).toBe('请详细一点')
    expect(row?.beforeSegments?.map((segment) => segment.text).join('')).toBe(
      '请简洁一点',
    )
    expect(row?.afterSegments?.map((segment) => segment.text).join('')).toBe(
      '请详细一点',
    )
    expect(row?.beforeSegments?.some((segment) => segment.kind === 'remove')).toBe(
      true,
    )
    expect(row?.afterSegments?.some((segment) => segment.kind === 'add')).toBe(
      true,
    )
  })

  it('差异过大的行保持 remove + add', () => {
    const result = diffPromptLines('完全不同的两行', '毫无关联的一句话')
    expect(kinds(result)).toEqual(['remove', 'add'])
  })

  it('CRLF 与 LF 视为同一种换行', () => {
    const result = diffPromptLines('a\r\nb\r\n', 'a\nb')
    expect(kinds(result)).toEqual(['same', 'same'])
    expect(result.degraded).toBe(false)
  })

  it('末尾换行差异不产生噪音行', () => {
    expect(kinds(diffPromptLines('a\n', 'a'))).toEqual(['same'])
    expect(kinds(diffPromptLines('a', 'a\n'))).toEqual(['same'])
  })

  it('空输入边界', () => {
    expect(diffPromptLines('', '').rows).toEqual([])
    expect(kinds(diffPromptLines('', 'x'))).toEqual(['add'])
    expect(kinds(diffPromptLines('x', ''))).toEqual(['remove'])
  })

  it('超过 maxChars 时 degraded 且不产生 modify', () => {
    const result = diffPromptLines('请简洁一点', '请详细一点', { maxChars: 4 })
    expect(result.degraded).toBe(true)
    expect(kinds(result)).not.toContain('modify')
    expect(kinds(result)).toContain('remove')
    expect(kinds(result)).toContain('add')
  })

  it('超过 maxLines 时 degraded 且不产生 modify', () => {
    const result = diffPromptLines('a\nb\nc', 'a\nb\nd', { maxLines: 2 })
    expect(result.degraded).toBe(true)
    expect(kinds(result)).toEqual(['same', 'same', 'remove', 'add'])
    expect(result.stats).toEqual({ added: 1, removed: 1, modified: 0 })
  })

  it('默认阈值：单侧超过 20k 字符或 1200 行即退化', () => {
    const byChars = diffPromptLines('x'.repeat(20001), 'y')
    expect(byChars.degraded).toBe(true)
    expect(kinds(byChars)).not.toContain('modify')

    const manyLines = Array.from({ length: 1201 }, (_, index) => `l${index}`).join(
      '\n',
    )
    const byLines = diffPromptLines(manyLines, 'x')
    expect(byLines.degraded).toBe(true)
  })

  it('单侧超过 2000 code point 时只给整行 modify', () => {
    const before = `${'a'.repeat(2001)}X`
    const after = `${'a'.repeat(2001)}Y`
    const result = diffPromptLines(before, after)
    expect(kinds(result)).toEqual(['modify'])
    expect(result.rows[0]?.before).toBe(before)
    expect(result.rows[0]?.after).toBe(after)
    expect(result.rows[0]?.beforeSegments).toBeUndefined()
    expect(result.rows[0]?.afterSegments).toBeUndefined()
  })

  it('字符级片段按 code point 切分，不拆代理对', () => {
    const result = diffPromptLines('a😀b', 'a😁b')
    expect(kinds(result)).toEqual(['modify'])
    const row = result.rows[0]
    expect(row?.beforeSegments?.map((segment) => segment.text)).toEqual([
      'a',
      '😀',
      'b',
    ])
    expect(row?.afterSegments?.map((segment) => segment.text)).toEqual([
      'a',
      '😁',
      'b',
    ])
    for (const segment of [
      ...(row?.beforeSegments ?? []),
      ...(row?.afterSegments ?? []),
    ]) {
      expect(/^[\uD800-\uDFFF]$/.test(segment.text)).toBe(false)
    }
  })
})

describe('DiffView', () => {
  const result = diffPromptLines('a\n请简洁一点', 'a\n请详细一点')

  it('inline 渲染修改行并标注增删底色', () => {
    const html = renderToStaticMarkup(
      createElement(DiffView, { result, view: 'inline' }),
    )
    expect(html).toContain('简洁')
    expect(html).toContain('详细')
    expect(html).toContain('bg-diff-del')
    expect(html).toContain('bg-diff-add')
    expect(html).toContain('bg-diff-del-mark')
    expect(html).toContain('bg-diff-add-mark')
  })

  it('side-by-side 渲染左右两栏', () => {
    const html = renderToStaticMarkup(
      createElement(DiffView, { result, view: 'side-by-side' }),
    )
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('简洁')
    expect(html).toContain('详细')
  })
})
