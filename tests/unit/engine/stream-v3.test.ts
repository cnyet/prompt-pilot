import { describe, expect, it } from 'vitest'
import { describeError } from '@/lib/engine/stream-v3'

// 日志字段只记错误类型与 code，绝不带 message（可能含提示词正文与密钥）。

class UpstreamError extends Error {
  readonly code = 'UPSTREAM_TIMEOUT'

  constructor() {
    super('Bearer sk-secret 提示词正文')
    this.name = 'UpstreamError'
  }
}

describe('describeError', () => {
  it('返回错误名；有字符串 code 时追加 code', () => {
    expect(describeError(new TypeError('sk-secret'))).toBe('TypeError')
    expect(describeError(new UpstreamError())).toBe('UpstreamError(UPSTREAM_TIMEOUT)')
  })

  it('从不包含错误 message', () => {
    expect(describeError(new Error('提示词正文与密钥'))).not.toContain('提示词正文')
    expect(describeError(new UpstreamError())).not.toContain('sk-secret')
  })

  it('非对象值回退到 typeof', () => {
    expect(describeError('boom')).toBe('string')
    expect(describeError(undefined)).toBe('undefined')
    expect(describeError(null)).toBe('object')
  })
})
