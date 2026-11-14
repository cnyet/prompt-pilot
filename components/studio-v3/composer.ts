/**
 * 工作台输入草稿与校验（Task 5）。
 *
 * 生成与优化各保留一份草稿，切换模式只切换校验对象，不清空另一侧输入。
 * 校验是纯函数：优先级为 unavailable → empty → sourceTooLong → instructionTooLong；
 * counts 用原始长度，空值判断才 trim。生成模式忽略 instruction。
 */
import type { ProcessMode, TargetType } from './api'

export const GENERATE_SOURCE_LIMIT = 2000
export const OPTIMIZE_SOURCE_LIMIT = 8000
export const OPTIMIZE_INSTRUCTION_LIMIT = 500

/** 当前模式的主输入上限（FR-1.2）。 */
export const SOURCE_LIMITS: Readonly<Record<ProcessMode, number>> = {
  generate: GENERATE_SOURCE_LIMIT,
  optimize: OPTIMIZE_SOURCE_LIMIT,
}

export interface ComposerDraft {
  sourceInput: string
  instruction: string
  targetType: TargetType
}

export interface ComposerState {
  mode: ProcessMode
  generate: ComposerDraft
  optimize: ComposerDraft
}

export interface ComposerInitialDraft {
  mode: ProcessMode
  sourceInput: string
  targetType: TargetType
}

export type ComposerInvalidReason =
  | 'empty'
  | 'sourceTooLong'
  | 'instructionTooLong'
  | 'unavailable'

export interface ComposerValidation {
  valid: boolean
  reason: ComposerInvalidReason | null
  counts: { source: number; instruction: number }
}

function emptyDraft(): ComposerDraft {
  return { sourceInput: '', instruction: '', targetType: 'text' }
}

/** 模板预填只写入对应模式的草稿，另一侧保持空。 */
export function initialComposerState(
  initial?: ComposerInitialDraft,
): ComposerState {
  const state: ComposerState = {
    mode: initial?.mode ?? 'generate',
    generate: emptyDraft(),
    optimize: emptyDraft(),
  }
  if (!initial) return state

  const draft: ComposerDraft = {
    sourceInput: initial.sourceInput,
    instruction: '',
    targetType: initial.targetType,
  }
  return initial.mode === 'optimize'
    ? { ...state, optimize: draft }
    : { ...state, generate: draft }
}

/** 当前模式对应的草稿；UI 与校验共用，避免两处各写一遍三元表达式。 */
export function activeDraft(state: ComposerState): ComposerDraft {
  return state.mode === 'generate' ? state.generate : state.optimize
}

export function validateComposer(
  state: ComposerState,
  options: { unavailable?: boolean } = {},
): ComposerValidation {
  const draft = activeDraft(state)
  const counts = {
    source: draft.sourceInput.length,
    instruction: draft.instruction.length,
  }

  if (options.unavailable) {
    return { valid: false, reason: 'unavailable', counts }
  }
  if (draft.sourceInput.trim().length === 0) {
    return { valid: false, reason: 'empty', counts }
  }
  if (counts.source > SOURCE_LIMITS[state.mode]) {
    return { valid: false, reason: 'sourceTooLong', counts }
  }
  if (state.mode === 'optimize' && counts.instruction > OPTIMIZE_INSTRUCTION_LIMIT) {
    return { valid: false, reason: 'instructionTooLong', counts }
  }
  return { valid: true, reason: null, counts }
}
