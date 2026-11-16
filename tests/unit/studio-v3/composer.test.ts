import { describe, expect, it } from 'vitest'
import {
  GENERATE_SOURCE_LIMIT,
  OPTIMIZE_INSTRUCTION_LIMIT,
  OPTIMIZE_SOURCE_LIMIT,
  initialComposerState,
  validateComposer,
  type ComposerState,
} from '@/components/studio-v3/composer'
import { isRequestActive } from '@/components/studio-v3/stream-reducer'

function generateState(sourceInput: string, instruction = ''): ComposerState {
  const state = initialComposerState()
  return {
    ...state,
    mode: 'generate',
    generate: { ...state.generate, sourceInput, instruction },
  }
}

function optimizeState(
  sourceInput: string,
  instruction = '',
): ComposerState {
  const state = initialComposerState()
  return {
    ...state,
    mode: 'optimize',
    optimize: { ...state.optimize, sourceInput, instruction },
  }
}

describe('initialComposerState', () => {
  it('默认优化模式，草稿为空、目标类型为文本', () => {
    const state = initialComposerState()
    expect(state.mode).toBe('optimize')
    expect(state.generate).toEqual({
      sourceInput: '',
      instruction: '',
      targetType: 'text',
    })
    expect(state.optimize).toEqual({
      sourceInput: '',
      instruction: '',
      targetType: 'text',
    })
  })

  it('生成模板预填只放进生成草稿，并保留目标类型', () => {
    const state = initialComposerState({
      mode: 'generate',
      sourceInput: '帮我写个周报',
      targetType: 'image',
    })

    expect(state.mode).toBe('generate')
    expect(state.generate).toEqual({
      sourceInput: '帮我写个周报',
      instruction: '',
      targetType: 'image',
    })
    expect(state.optimize).toEqual({
      sourceInput: '',
      instruction: '',
      targetType: 'text',
    })
  })

  it('优化模板预填只放进优化草稿，并选中优化模式', () => {
    const state = initialComposerState({
      mode: 'optimize',
      sourceInput: '镜头慢慢推近',
      targetType: 'video',
    })

    expect(state.mode).toBe('optimize')
    expect(state.optimize).toEqual({
      sourceInput: '镜头慢慢推近',
      instruction: '',
      targetType: 'video',
    })
    expect(state.generate).toEqual({
      sourceInput: '',
      instruction: '',
      targetType: 'text',
    })
  })
})

describe('validateComposer 生成模式', () => {
  it('空串返回 empty', () => {
    expect(validateComposer(generateState(''))).toEqual({
      valid: false,
      reason: 'empty',
      counts: { source: 0, instruction: 0 },
    })
  })

  it('恰好 2000 字有效，2001 字超限', () => {
    expect(validateComposer(generateState('a'.repeat(GENERATE_SOURCE_LIMIT)))).toEqual({
      valid: true,
      reason: null,
      counts: { source: GENERATE_SOURCE_LIMIT, instruction: 0 },
    })
    expect(
      validateComposer(generateState('a'.repeat(GENERATE_SOURCE_LIMIT + 1))).reason,
    ).toBe('sourceTooLong')
  })

  it('生成模式忽略 instruction 长度', () => {
    const state = generateState('写个周报', 'a'.repeat(OPTIMIZE_INSTRUCTION_LIMIT + 1))
    expect(validateComposer(state).valid).toBe(true)
  })
})

describe('validateComposer 优化模式', () => {
  it('空串返回 empty', () => {
    expect(validateComposer(optimizeState('')).reason).toBe('empty')
  })

  it('8000 字有效，8001 字超限', () => {
    expect(validateComposer(optimizeState('a'.repeat(OPTIMIZE_SOURCE_LIMIT))).valid).toBe(
      true,
    )
    expect(
      validateComposer(optimizeState('a'.repeat(OPTIMIZE_SOURCE_LIMIT + 1))).reason,
    ).toBe('sourceTooLong')
  })

  it('优化要求 500 字有效，501 字超限', () => {
    expect(
      validateComposer(optimizeState('原文', 'a'.repeat(OPTIMIZE_INSTRUCTION_LIMIT))).valid,
    ).toBe(true)
    expect(
      validateComposer(optimizeState('原文', 'a'.repeat(OPTIMIZE_INSTRUCTION_LIMIT + 1)))
        .reason,
    ).toBe('instructionTooLong')
  })

  it('输入与要求同时超限时，先报 sourceTooLong', () => {
    expect(
      validateComposer(
        optimizeState(
          'a'.repeat(OPTIMIZE_SOURCE_LIMIT + 1),
          'a'.repeat(OPTIMIZE_INSTRUCTION_LIMIT + 1),
        ),
      ).reason,
    ).toBe('sourceTooLong')
  })
})

describe('validateComposer 计数与空白', () => {
  it('counts.source 用原始长度，不裁剪', () => {
    const result = validateComposer(generateState('  周报  '))
    expect(result.counts.source).toBe(6)
    expect(result.valid).toBe(true)
  })

  it('纯空白串按 trim 后为空处理', () => {
    expect(validateComposer(generateState('   ')).reason).toBe('empty')
    expect(validateComposer(optimizeState('\n\t ')).reason).toBe('empty')
  })

  it('counts.instruction 用原始长度', () => {
    const result = validateComposer(optimizeState('原文', '更严格 '))
    expect(result.counts).toEqual({ source: 2, instruction: 4 })
  })
})

describe('validateComposer 不可用状态', () => {
  it('无可用模型时即使内容有效也返回 unavailable', () => {
    expect(
      validateComposer(generateState('写个周报'), { unavailable: true }),
    ).toEqual({
      valid: false,
      reason: 'unavailable',
      counts: { source: 4, instruction: 0 },
    })
  })

  it('unavailable 优先于 empty', () => {
    expect(validateComposer(generateState(''), { unavailable: true }).reason).toBe(
      'unavailable',
    )
  })

  it('unavailable 优先于超限', () => {
    const state = optimizeState('a'.repeat(OPTIMIZE_SOURCE_LIMIT + 1))
    expect(validateComposer(state, { unavailable: true }).reason).toBe('unavailable')
  })
})

describe('模式切换', () => {
  it('切换模式不改动另一侧草稿，校验只读取当前模式', () => {
    const seeded = initialComposerState()
    const edited: ComposerState = {
      ...seeded,
      mode: 'generate',
      generate: {
        ...seeded.generate,
        sourceInput: '保留的生成需求',
        targetType: 'image',
      },
    }
    const switched: ComposerState = { ...edited, mode: 'optimize' }

    expect(switched.generate.sourceInput).toBe('保留的生成需求')
    expect(switched.generate.targetType).toBe('image')
    expect(switched.optimize.sourceInput).toBe('')
    expect(validateComposer(switched).reason).toBe('empty')

    // 校验是纯函数，不改动传入的状态
    expect(edited.mode).toBe('generate')
    expect(edited.generate.sourceInput).toBe('保留的生成需求')
  })
})

describe('并发守卫', () => {
  it('进行中的阶段返回 true，终态与空闲返回 false', () => {
    expect(isRequestActive('starting')).toBe(true)
    expect(isRequestActive('streaming')).toBe(true)
    expect(isRequestActive('canceling')).toBe(true)
    expect(isRequestActive('idle')).toBe(false)
    expect(isRequestActive('completed')).toBe(false)
    expect(isRequestActive('canceled')).toBe(false)
    expect(isRequestActive('failed')).toBe(false)
  })
})
