import { describe, expect, it } from 'vitest'
import {
  StreamingJsonParser,
  type StreamingJsonEvent,
} from '@/lib/llm/streaming-json'

function parseAll(chunks: readonly string[]): StreamingJsonEvent[] {
  const parser = new StreamingJsonParser()
  const events: StreamingJsonEvent[] = []
  for (const chunk of chunks) {
    events.push(...parser.push(chunk))
  }
  const result = parser.finish()
  expect(result.ok).toBe(true)
  return events
}

describe('StreamingJsonParser', () => {
  it('只在字符串闭合后发事件，跨分块不吐半截值', () => {
    const parser = new StreamingJsonParser()
    expect(parser.push('{"role":{"per')).toEqual([])
    expect(parser.push('sona":"你是')).toEqual([])

    const first = parser.push('产品评审主持人')
    expect(first).toEqual([])

    const second = parser.push(
      '","expertise":"流程设计"},"objective":{"goal":"写出议程"}}',
    )
    expect(second[0]).toEqual({
      kind: 'value',
      path: ['role', 'persona'],
      value: '你是产品评审主持人',
    })
    expect(second[1]).toEqual({
      kind: 'value',
      path: ['role', 'expertise'],
      value: '流程设计',
    })
    expect(second[2]).toMatchObject({
      kind: 'container',
      path: ['role'],
    })
    expect(second[3]).toEqual({
      kind: 'value',
      path: ['objective', 'goal'],
      value: '写出议程',
    })

    expect(parser.finish().ok).toBe(true)
  })

  it('正确处理转义与 unicode，且事件不重复', () => {
    const events = parseAll(['{"a":"第一行\\n第二行\\"引号\\"","b":"\\u4f60\\u597d"}'])
    expect(events).toEqual([
      { kind: 'value', path: ['a'], value: '第一行\n第二行"引号"' },
      { kind: 'value', path: ['b'], value: '你好' },
      { kind: 'container', path: [], value: { a: '第一行\n第二行"引号"', b: '你好' } },
    ])

    const parser = new StreamingJsonParser()
    parser.push('{"a":"x"}')
    expect(parser.push('')).toEqual([])
  })

  it('数组与嵌套对象按闭合顺序发事件', () => {
    const events = parseAll([
      '{"objective":{"successCriteria":["第一条",',
      '"第二条"],"nonGoals":[]}}',
    ])
    const values = events.filter((event) => event.kind === 'value')
    expect(values.map((event) => event.path)).toEqual([
      ['objective', 'successCriteria', 0],
      ['objective', 'successCriteria', 1],
    ])
    const containers = events.filter((event) => event.kind === 'container')
    expect(containers.map((event) => event.path)).toEqual([
      ['objective', 'successCriteria'],
      ['objective', 'nonGoals'],
      ['objective'],
      [],
    ])
  })

  it('支持根数组与数字、布尔、null 标量', () => {
    const events = parseAll(['[{"n":1.5,"ok":true,"none":null}]'])
    const values = events.filter((event) => event.kind === 'value')
    expect(values).toEqual([
      { kind: 'value', path: [0, 'n'], value: 1.5 },
      { kind: 'value', path: [0, 'ok'], value: true },
      { kind: 'value', path: [0, 'none'], value: null },
    ])
    const containerPaths = events
      .filter((event) => event.kind === 'container')
      .map((event) => event.path)
    expect(containerPaths).toEqual([[0], []])
  })

  it('无法恢复的语法错误立即失败，交由调用方整体解析', () => {
    const parser = new StreamingJsonParser()
    parser.push('{"role": }')
    expect(parser.failed).toBe(true)
    expect(parser.finish().ok).toBe(false)
  })

  it('根值闭合后出现多余内容视为失败', () => {
    const parser = new StreamingJsonParser()
    parser.push('{"a":"x"} 额外内容')
    expect(parser.failed).toBe(true)
    expect(parser.finish().ok).toBe(false)
  })

  it('输入不完整时 finish 返回失败而不是伪造结果', () => {
    const parser = new StreamingJsonParser()
    parser.push('{"role":{"persona":"还没写完')
    expect(parser.failed).toBe(false)
    const result = parser.finish()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('非 JSON 文本不会产生任何字段事件', () => {
    const parser = new StreamingJsonParser()
    const events = parser.push('这不是 JSON，只是一段解释。')
    expect(events).toEqual([])
    expect(parser.failed).toBe(true)
  })
})
