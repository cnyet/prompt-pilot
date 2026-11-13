import { describe, expect, it } from 'vitest'
import { META_SEPARATOR, MetaSplitter } from '@/lib/engine/prompts/meta'

function split(chunks: string[]): { body: string; meta: ReturnType<MetaSplitter['finish']> } {
  const splitter = new MetaSplitter()
  let body = ''
  for (const chunk of chunks) {
    body += splitter.push(chunk)
  }
  body += splitter.flushTail()
  return { body, meta: splitter.finish() }
}

describe('MetaSplitter', () => {
  it('正常切分：正文实时放行，分隔符后缓冲，finish 解析出标题与说明', () => {
    const { body, meta } = split([
      '# 周报提示词\n\n',
      `你是一名运营专员。\n${META_SEPARATOR}\n`,
      '{"title":"周报生成","notes":["补了输出格式"]}',
    ])
    expect(body).toBe('# 周报提示词\n\n你是一名运营专员。\n')
    expect(meta).toEqual({ title: '周报生成', notes: ['补了输出格式'] })
  })

  it('分隔符跨 chunk 劈开时不泄漏半个分隔符', () => {
    const { body, meta } = split([
      '正文A',
      '<<<PROMPTPILOT_',
      'META>>>\n{"title":"t","notes":[]}',
    ])
    expect(body).toBe('正文A')
    expect(meta).toEqual({ title: 't', notes: [] })
  })

  it('缺分隔符：全部当正文，降级 title null + notes []', () => {
    const { body, meta } = split(['只有正文，没有元数据'])
    expect(body).toBe('只有正文，没有元数据')
    expect(meta).toEqual({ title: null, notes: [] })
  })

  it('坏 JSON：正文完整，降级 title null + notes []', () => {
    const { body, meta } = split([
      `正文B\n${META_SEPARATOR}\n`,
      '{"title": 断裂的json',
    ])
    expect(body).toBe('正文B\n')
    expect(meta).toEqual({ title: null, notes: [] })
  })

  it('分隔符提前出现（正文为空）：忽略元数据，降级', () => {
    const { body, meta } = split([`${META_SEPARATOR}\n{"title":"t","notes":["x"]}`])
    expect(body).toBe('')
    expect(meta).toEqual({ title: null, notes: [] })
  })

  it('notes 超过 3 条截断，非字符串元素丢弃', () => {
    const { meta } = split([
      `正文\n${META_SEPARATOR}\n`,
      JSON.stringify({
        title: 't',
        notes: ['一', 2, '三', '四', null, '五'] as unknown as string[],
      }),
    ])
    expect(meta.notes).toEqual(['一', '三', '四'])
  })

  it('title 非字符串或为空时降级为 null', () => {
    const { meta } = split([`正文\n${META_SEPARATOR}\n`, '{"title":"","notes":[]}'])
    expect(meta.title).toBeNull()
  })
})
