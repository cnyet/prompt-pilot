import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownView } from '@/components/studio-v3/MarkdownView'
import { markdownToPlainText } from '@/lib/markdown/plain'

const render = (source: string) =>
  renderToStaticMarkup(createElement(MarkdownView, { source }))

describe('MarkdownView', () => {
  it('渲染标题与 GFM 表格', () => {
    const html = render('# 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('不执行原始 HTML', () => {
    const html = render('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('链接在新窗口打开并带安全 rel', () => {
    const html = render('[x](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })

  it('拦截 javascript: 链接', () => {
    const html = render('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('未闭合代码块不抛错并渲染 pre', () => {
    expect(() => render('```\n未闭合')).not.toThrow()
    const html = render('```\n未闭合')
    expect(html).toContain('<pre')
    expect(html).toContain('未闭合')
  })

  it('代码块与表格可横向滚动，图片限宽', () => {
    const code = render('```ts\nconst a = 1\n```')
    expect(code).toContain('overflow-x-auto')
    const table = render('| a |\n|---|\n| 1 |')
    expect(table).toContain('overflow-x-auto')
    const image = render('![图](https://example.com/a.png)')
    expect(image).toContain('max-w-full')
  })

  it('合并外部 className', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownView, { source: 'x', className: 'custom-class' }),
    )
    expect(html).toContain('custom-class')
  })
})

describe('markdownToPlainText', () => {
  it('去 Markdown 标记得到可读纯文本', () => {
    expect(
      markdownToPlainText('# 标题\n**粗** `code` [链接](https://x)'),
    ).toBe('标题\n粗 code 链接')
  })

  it('保留图片 alt 与引用正文', () => {
    expect(markdownToPlainText('![封面](https://x/a.png)\n\n> 引用一句')).toBe(
      '封面\n\n引用一句',
    )
  })

  it('去掉列表标记与表格分隔行', () => {
    expect(markdownToPlainText('- 一\n- 二\n\n| a | b |\n|---|---|\n| 1 | 2 |')).toBe(
      '一\n二\n\na b\n1 2',
    )
  })

  it('压缩多余空行并去掉首尾空白', () => {
    expect(markdownToPlainText('\n\nA\n\n\n\nB\n\n')).toBe('A\n\nB')
  })

  it('纯文本不泄漏脚本内容', () => {
    expect(markdownToPlainText('<script>alert(1)</script>正文')).toBe('正文')
  })
})
