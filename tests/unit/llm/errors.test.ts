import { describe, expect, it, vi } from 'vitest'
import {
  LlmError,
  backoffDelay,
  classifyHttpError,
  createLlmError,
  errorCodeForKind,
  withRetry,
} from '@/lib/llm/errors'

function asLlmError(error: unknown): LlmError {
  return error instanceof LlmError
    ? error
    : createLlmError('unknown', error instanceof Error ? error.message : String(error))
}

describe('错误码分级', () => {
  it.each([
    [401, 'AuthenticationError', 'auth', false],
    [403, 'OperationDenied.ServiceNotOpen', 'forbidden', false],
    [403, 'AccountOverdueError', 'forbidden', false],
    [400, 'InvalidParameter.temperature', 'invalid_input', false],
    [400, 'InputTextSensitiveContentDetected', 'content_filter', false],
    [400, 'OutputTextSensitiveContentDetected', 'content_filter', false],
    [429, 'RateLimitExceeded.EndpointRPMExceeded', 'rate_limited', true],
    [429, 'ServerOverloaded', 'overloaded', true],
    [429, 'RequestBurstTooFast', 'overloaded', true],
    [429, 'QuotaExceeded', 'quota_exceeded', false],
    [500, 'InternalServiceError', 'server', true],
    [503, 'NoAvailableService', 'server', true],
    [404, 'NotFound', 'invalid_input', false],
    [418, 'Teapot', 'unknown', false],
  ])(
    'HTTP %i（%s）→ %s，retryable=%s',
    (status, code, kind, retryable) => {
      const error = classifyHttpError(status, code, '原始消息')
      expect(error.kind).toBe(kind)
      expect(error.retryable).toBe(retryable)
      expect(error.code).toBe(code)
    },
  )

  it('401 的文案明确指向 ARK_API_KEY', () => {
    const error = classifyHttpError(401, 'AuthenticationError', 'bad key')
    expect(error.message).toContain('ARK_API_KEY')
  })

  it('SSE 错误码稳定且与 kind 一一对应', () => {
    expect(errorCodeForKind('auth')).toBe('LLM_AUTH')
    expect(errorCodeForKind('quota_exceeded')).toBe('LLM_QUOTA_EXCEEDED')
    expect(errorCodeForKind('invalid_output')).toBe('LLM_INVALID_OUTPUT')
    expect(errorCodeForKind('unknown')).toBe('LLM_UNKNOWN')
  })
})

describe('退避重试', () => {
  it('可重试错误按次数重试，最后一次仍失败则抛出', async () => {
    const operation = vi.fn(async () => {
      throw createLlmError('rate_limited', '限流')
    })
    const sleep = vi.fn(async () => {})

    await expect(
      withRetry(operation, asLlmError, {
        maxAttempts: 3,
        baseDelayMs: 10,
        sleep,
      }),
    ).rejects.toMatchObject({ kind: 'rate_limited' })

    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('不可重试错误只调用一次', async () => {
    const operation = vi.fn(async () => {
      throw createLlmError('auth', '认证失败')
    })
    const sleep = vi.fn(async () => {})

    await expect(
      withRetry(operation, asLlmError, {
        maxAttempts: 3,
        sleep,
      }),
    ).rejects.toMatchObject({ kind: 'auth' })

    expect(operation).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('重试后成功直接返回结果', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls += 1
        if (calls === 1) {
          throw createLlmError('server', '临时错误')
        }
        return 'ok'
      },
      asLlmError,
      { maxAttempts: 3, sleep: async () => {} },
    )

    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('退避时长带抖动且不超过上限', () => {
    expect(backoffDelay(1, { baseDelayMs: 100, random: () => 0 })).toBe(80)
    expect(backoffDelay(1, { baseDelayMs: 100, random: () => 1 })).toBe(120)
    expect(
      backoffDelay(10, { baseDelayMs: 100, maxDelayMs: 1000, random: () => 1 }),
    ).toBe(1000)
  })
})
