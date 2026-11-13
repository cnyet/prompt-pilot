import { describe, expect, it } from 'vitest'
import { modelErrorKind } from '@/lib/errors/modelErrorKind'

// 错误分类只按 code 映射，不解析 message；未知 code 归为 unknown。

describe('modelErrorKind', () => {
  it.each([
    ['NO_MODEL', 'unavailable'],
    ['ITERATION_IN_FLIGHT', 'in-flight'],
    ['RECORD_NOT_FOUND', 'not-found'],
    ['INVALID_INPUT', 'invalid'],
  ] as const)('%s → %s', (code, kind) => {
    expect(modelErrorKind(code)).toBe(kind)
  })

  it('未知 code 归为 unknown', () => {
    expect(modelErrorKind('')).toBe('unknown')
    expect(modelErrorKind('LLM_UNKNOWN')).toBe('unknown')
    expect(modelErrorKind('RECORD_HAS_NO_OUTPUT')).toBe('unknown')
  })

  it('大小写与连字符不影响分类', () => {
    expect(modelErrorKind('no_model')).toBe('unavailable')
    expect(modelErrorKind('iteration-in-flight')).toBe('in-flight')
    expect(modelErrorKind(' record-not-found ')).toBe('not-found')
  })
})
