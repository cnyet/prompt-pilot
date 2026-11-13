/**
 * 工作台流式状态机（Task 4）。
 *
 * 只处理 SSE 事件与善后动作，不触碰 React 与网络。语义要点：
 * - delta 只在 starting / streaming 追加；usage 只在 streaming 合并。
 * - done(completed / canceled) 把 draft 落到 committed；done(failed) 丢弃 draft、
 *   保留上一轮 committed，并用 settling 标记等待详情。
 * - abort 先落草稿再进入 canceling，保证中断后已生成内容仍可见。
 * - settled 用服务端详情覆盖正文与说明；SSE 没给 usage 时用最新迭代补齐。
 */
import type { IterationDto, RecordDetailDto, UsageDto } from './api'

export type StreamPhase =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'canceling'
  | 'completed'
  | 'canceled'
  | 'failed'

export interface StreamError {
  code: string
  message: string
  retryable: boolean
}

export interface StreamState {
  phase: StreamPhase
  recordId: string | null
  iterationId: string | null
  committedOutput: string
  draftOutput: string
  notes: string[]
  usage: UsageDto | null
  detail: RecordDetailDto | null
  error: StreamError | null
  settling: boolean
  unavailable: boolean
}

export type StreamAction =
  | { type: 'start'; recordId: string; iterationId: string }
  | { type: 'delta'; text: string }
  | { type: 'meta'; notes: string[] }
  | { type: 'usage'; usage: UsageDto }
  | { type: 'error'; error: StreamError }
  | { type: 'done'; status: 'completed' | 'canceled' | 'failed' }
  | { type: 'abort' }
  | { type: 'stream-closed' }
  | { type: 'settled'; detail: RecordDetailDto }
  | { type: 'unavailable' }
  | { type: 'reset' }

export const initialStreamState: StreamState = {
  phase: 'idle',
  recordId: null,
  iterationId: null,
  committedOutput: '',
  draftOutput: '',
  notes: [],
  usage: null,
  detail: null,
  error: null,
  settling: false,
  unavailable: false,
}

/** 进行中的请求：双击与并发守卫用。 */
export function isRequestActive(phase: StreamPhase): boolean {
  return phase === 'starting' || phase === 'streaming' || phase === 'canceling'
}

/**
 * 事件循环结束后的收尾决策：只有既没收到 done、也没有在 catch 中发过终态
 * （transport 错误已按取消或失败收尾）时才补发 stream-closed。
 * 防止 catch 里已 dispatch 的 done(canceled) 被随后的 stream-closed 覆盖为 failed。
 */
export function shouldFinalizeStreamClosed(input: {
  sawDone: boolean
  terminalDispatched: boolean
}): boolean {
  return !input.sawDone && !input.terminalDispatched
}

const MAX_NOTES = 3

function commitDraft(state: StreamState): string {
  return state.draftOutput.length > 0 ? state.draftOutput : state.committedOutput
}

/** 最新迭代的已知用量；token 未知时保持 null，不补 0。 */
function usageFromIteration(iterations: IterationDto[]): UsageDto | null {
  const latest = iterations.at(-1)
  if (!latest || latest.tokensIn === null || latest.tokensOut === null) return null
  return {
    tokensIn: latest.tokensIn,
    tokensOut: latest.tokensOut,
    ...(latest.costCny !== null ? { costCny: latest.costCny } : {}),
    ...(latest.latencyMs !== null ? { latencyMs: latest.latencyMs } : {}),
  }
}

/** 对应迭代优先，找不到时回落到最新迭代，再回落到流内 notes。 */
function notesFromDetail(state: StreamState, iterations: IterationDto[]): string[] {
  const matching = state.iterationId
    ? iterations.find((iteration) => iteration.id === state.iterationId)
    : undefined
  const target = matching ?? iterations.at(-1)
  return target ? target.notes.slice(0, MAX_NOTES) : state.notes
}

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'start': {
      // 重复 start 不重置正在流式输出的草稿
      if (isRequestActive(state.phase)) return state
      return {
        ...state,
        phase: 'starting',
        recordId: action.recordId,
        iterationId: action.iterationId,
        draftOutput: '',
        notes: [],
        usage: null,
        error: null,
        settling: false,
        unavailable: false,
      }
    }

    case 'delta': {
      if (state.phase !== 'starting' && state.phase !== 'streaming') return state
      return {
        ...state,
        phase: 'streaming',
        draftOutput: state.draftOutput + action.text,
      }
    }

    case 'meta': {
      if (state.phase !== 'starting' && state.phase !== 'streaming') return state
      return { ...state, notes: action.notes.slice(0, MAX_NOTES) }
    }

    case 'usage': {
      if (state.phase !== 'streaming') return state
      return { ...state, usage: action.usage }
    }

    case 'error': {
      return { ...state, error: action.error }
    }

    case 'done': {
      if (action.status === 'failed') {
        return {
          ...state,
          phase: 'failed',
          committedOutput: state.committedOutput,
          draftOutput: '',
          settling: true,
        }
      }
      return {
        ...state,
        phase: action.status,
        committedOutput: commitDraft(state),
        draftOutput: '',
        settling: true,
      }
    }

    case 'abort': {
      return {
        ...state,
        phase: 'canceling',
        committedOutput: commitDraft(state),
        draftOutput: '',
      }
    }

    case 'stream-closed': {
      return {
        ...state,
        phase: 'failed',
        committedOutput: state.committedOutput,
        draftOutput: '',
        settling: true,
      }
    }

    case 'settled': {
      const { detail } = action
      const iterations = detail.record.iterations
      return {
        ...state,
        phase: state.phase === 'canceling' ? 'canceled' : state.phase,
        committedOutput: detail.record.latestOutput,
        draftOutput: '',
        notes: notesFromDetail(state, iterations),
        usage: state.usage ?? usageFromIteration(iterations),
        detail,
        settling: false,
      }
    }

    case 'unavailable': {
      return { ...state, unavailable: true }
    }

    case 'reset': {
      return initialStreamState
    }
  }
}
