'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  FIELD_KEYS,
  type Assumption,
  type FieldKey,
  type PromptSchema,
} from '@/lib/engine/schema'
import { classifyTaskType } from '@/lib/engine/compose'
import { buildSchemaFromFields } from '@/lib/engine/paths'
import {
  apiErrorSchema,
  isFieldKey,
  parseSseStream,
  SseParseError,
} from '@/lib/engine/sse'
import {
  acceptSuggestion as acceptSuggestionInDoc,
  applyFieldRewrite,
  applyStreamDelta,
  applyUserEdit,
  commitField,
  discardSuggestion as discardSuggestionInDoc,
  failField,
  getFieldState,
  redo as redoDoc,
  startField,
  undo as undoDoc,
  type Command,
  type PromptDoc,
} from '@/lib/engine/doc'
import {
  createInitialState,
  toFieldViewMap,
  type FieldOp,
  type FieldOpMap,
  type FieldViewMap,
  type GenerationError,
  type GenerationState,
} from './types'
import type { TokenUsage } from '@/lib/llm/types'

const STALL_TIMEOUT_MS = 15_000

export type GenerationAction =
  | { type: 'reset' }
  | { type: 'begin'; fields: readonly FieldKey[]; full: boolean }
  | { type: 'field-start'; field: FieldKey }
  | { type: 'delta'; field: FieldKey; text: string }
  | { type: 'field-done'; field: FieldKey }
  | { type: 'edit'; field: FieldKey; text: string }
  | { type: 'accept-suggestion'; field: FieldKey }
  | { type: 'discard-suggestion'; field: FieldKey }
  | { type: 'op-start'; field: FieldKey; action: FieldOp }
  | { type: 'op-progress'; field: FieldKey; text: string }
  | { type: 'field-rewrite'; field: FieldKey; text: string }
  | { type: 'op-fail'; field: FieldKey; message: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'reasoning'; text: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'stop' }
  | { type: 'fail'; error: GenerationError; field?: FieldKey }
  | {
      type: 'done'
      title: string
      assumptions: Assumption[]
      durationMs: number
      finishReason: 'stop' | 'error' | 'aborted'
    }

function settleStreamingFields(
  doc: PromptDoc,
  finalStatus: 'done' | 'partial',
): PromptDoc {
  let next = doc
  for (const field of FIELD_KEYS) {
    const state = next.fields[field]
    if (!state) {
      continue
    }
    if (state.status === 'streaming' || next.pending[field] !== undefined) {
      next = commitField(next, field, finalStatus)
    }
  }
  return next
}

function withoutFieldOp(ops: FieldOpMap, field: FieldKey): FieldOpMap {
  if (ops[field] === undefined) {
    return ops
  }
  const next = { ...ops }
  delete next[field]
  return next
}

/**
 * 由当前字段文本重建 schema。doc.schema 在非流式事件后同步写入，
 * 供工单 04 的假设 chip 与补丁按叶子路径读写；流式 delta 期间不重建，
 * 避免每来一个字符就把八个字段全量解析一遍。
 */
function deriveDocSchema(state: GenerationState): PromptSchema {
  const texts: Partial<Record<FieldKey, string>> = {}
  for (const field of FIELD_KEYS) {
    texts[field] = state.doc.fields[field]?.value ?? ''
  }
  return buildSchemaFromFields(texts, {
    title: state.title || '未命名提示词',
    taskType: state.title ? classifyTaskType(state.title) : 'other',
    templateId: 'field-text-v1',
    assumptions: state.assumptions,
  })
}

/**
 * 生成状态 reducer。四条写入规则本身在 lib/engine/doc.ts，
 * 这里只做事件调度，所以 delta 不再可能无条件追加到字段文本上。
 */
export function generationReducer(
  state: GenerationState,
  action: GenerationAction,
): GenerationState {
  const next = reduceGenerationState(state, action)
  if (
    next === state ||
    next.phase === 'idle' ||
    action.type === 'delta' ||
    action.type === 'field-start' ||
    action.type === 'op-progress' ||
    action.type === 'usage' ||
    action.type === 'reasoning'
  ) {
    return next
  }
  return { ...next, doc: { ...next.doc, schema: deriveDocSchema(next) } }
}

function reduceGenerationState(
  state: GenerationState,
  action: GenerationAction,
): GenerationState {
  switch (action.type) {
    case 'reset':
      return createInitialState()

    case 'begin': {
      const doc = action.full ? createInitialState().doc : state.doc
      return {
        ...state,
        phase: 'streaming',
        doc,
        scheduled: action.fields,
        error: null,
        title: action.full ? '' : state.title,
        assumptions: action.full ? [] : state.assumptions,
        durationMs: action.full ? null : state.durationMs,
        fieldOps: action.full ? {} : state.fieldOps,
        // 每次请求都重新计用量与思考：重试是新的调用，不能沿用上一次的账。
        usage: null,
        reasoning: '',
      }
    }

    case 'field-start':
      return {
        ...state,
        phase: 'streaming',
        doc: startField(state.doc, action.field),
      }

    case 'delta':
      // R1：只写 pending。用户在生成过程中改过字，这里也不会碰文档值。
      return {
        ...state,
        phase: 'streaming',
        doc: applyStreamDelta(state.doc, action.field, action.text),
      }

    case 'field-done':
      // R2：dirty 时把 AI 内容转成建议，不覆盖用户输入。
      return {
        ...state,
        doc: commitField(state.doc, action.field, 'done'),
      }

    case 'edit':
      // R3：用户编辑立即写文档。
      return {
        ...state,
        doc: applyUserEdit(state.doc, action.field, action.text),
      }

    case 'accept-suggestion':
      return {
        ...state,
        doc: acceptSuggestionInDoc(state.doc, action.field),
      }

    case 'discard-suggestion':
      return {
        ...state,
        doc: discardSuggestionInDoc(state.doc, action.field),
      }

    case 'op-start':
      return {
        ...state,
        fieldOps: {
          ...state.fieldOps,
          [action.field]: {
            status: 'running',
            action: action.action,
            preview: '',
          },
        },
      }

    case 'op-progress': {
      const op = state.fieldOps[action.field]
      if (!op || op.status !== 'running') {
        return state
      }
      return {
        ...state,
        fieldOps: {
          ...state.fieldOps,
          [action.field]: { ...op, preview: action.text },
        },
      }
    }

    case 'field-rewrite':
      return {
        ...state,
        doc: applyFieldRewrite(state.doc, action.field, action.text),
        fieldOps: withoutFieldOp(state.fieldOps, action.field),
      }

    case 'op-fail': {
      const op = state.fieldOps[action.field]
      if (!op) {
        return state
      }
      return {
        ...state,
        fieldOps: {
          ...state.fieldOps,
          [action.field]: {
            ...op,
            status: 'failed',
            error: action.message,
          },
        },
      }
    }

    case 'usage':
      return { ...state, usage: action.usage }

    case 'reasoning':
      // 思维链只累积到独立字段，绝不进入 doc 的字段文本。
      return { ...state, reasoning: state.reasoning + action.text }

    case 'undo':
      return { ...state, doc: undoDoc(state.doc) }

    case 'redo':
      return { ...state, doc: redoDoc(state.doc) }

    case 'stop': {
      let doc = settleStreamingFields(state.doc, 'partial')
      for (const field of FIELD_KEYS) {
        const current = getFieldState(doc, field)
        if (current?.status === 'streaming') {
          doc = {
            ...doc,
            fields: {
              ...doc.fields,
              [field]: { ...current, status: 'partial' },
            },
          }
        }
      }
      return {
        ...state,
        phase: state.phase === 'streaming' ? 'stopped' : state.phase,
        doc,
      }
    }

    case 'fail': {
      const targets = action.field
        ? [action.field]
        : FIELD_KEYS.filter((field) => {
            const current = state.doc.fields[field]
            return (
              current?.status === 'streaming' ||
              state.doc.pending[field] !== undefined
            )
          })
      let doc = state.doc
      for (const field of targets) {
        // 先落盘已经收到的内容，再标记失败，避免失败把已生成文本丢掉。
        doc = commitField(doc, field, 'partial')
        doc = failField(doc, field, action.error.message)
      }
      return { ...state, phase: 'error', doc, error: action.error }
    }

    case 'done': {
      const doc = settleStreamingFields(state.doc, 'done')
      return {
        ...state,
        phase: action.finishReason === 'error' ? 'error' : 'done',
        doc,
        title: action.title || state.title,
        assumptions:
          action.assumptions.length > 0 ? action.assumptions : state.assumptions,
        durationMs: action.durationMs,
        error: action.finishReason === 'error' ? state.error : null,
      }
    }

    default:
      return state
  }
}

class GenerationFailure extends Error {
  readonly detail: GenerationError

  constructor(detail: GenerationError) {
    super(detail.message)
    this.name = 'GenerationFailure'
    this.detail = detail
  }
}

function fieldFromPath(path: string): FieldKey | null {
  const [head] = path.split('.')
  return head !== undefined && isFieldKey(head) ? head : null
}

export interface GenerationApi {
  phase: GenerationState['phase']
  fields: FieldViewMap
  scheduled: readonly FieldKey[]
  title: string
  assumptions: Assumption[]
  durationMs: number | null
  error: GenerationError | null
  /** 本次请求的用量。null 表示服务端没有发 usage 事件。 */
  usage: TokenUsage | null
  /** 本次请求的思维链原文，展示在可折叠的「思考」区。 */
  reasoning: string
  isBusy: boolean
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  /** 撤销栈顶命令。界面据此显示上一步是 AI 写入还是用户编辑。 */
  lastCommand: Command | null
  /** 由字段文本按结构化路径重建的 schema，供 JSON 视图使用。 */
  schema: PromptSchema
  /** 单字段重算状态，按字段隔离。 */
  fieldOps: FieldOpMap
  /** 当前有重算在跑的字段，没有则为 null。 */
  runningOpField: FieldKey | null
  opBusy: boolean
  generate: (input: string) => Promise<void>
  retryFields: (fields: readonly FieldKey[]) => Promise<void>
  runFieldOp: (field: FieldKey, action: FieldOp) => Promise<void>
  updateField: (field: FieldKey, text: string) => void
  acceptSuggestion: (field: FieldKey) => void
  discardSuggestion: (field: FieldKey) => void
  undo: () => void
  redo: () => void
  stop: () => void
  reset: () => void
}

export function useGeneration(): GenerationApi {
  const [state, dispatch] = useReducer(
    generationReducer,
    undefined,
    createInitialState,
  )
  const activeRef = useRef(false)
  const runIdRef = useRef(0)
  const lastInputRef = useRef('')
  const controllerRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const opActiveRef = useRef(false)
  const opControllerRef = useRef<AbortController | null>(null)

  // 离开工作台时中止请求，避免服务端继续空转。
  useEffect(() => {
    return () => {
      activeRef.current = false
      controllerRef.current?.abort()
      opControllerRef.current?.abort()
    }
  }, [])

  const run = useCallback(
    async (input: string, fields?: readonly FieldKey[]): Promise<void> => {
      if (activeRef.current || opActiveRef.current) {
        return
      }
      const trimmed = input.trim()
      if (trimmed.length < 2) {
        return
      }

      activeRef.current = true
      lastInputRef.current = trimmed
      const runId = runIdRef.current + 1
      runIdRef.current = runId
      stopRequestedRef.current = false

      const controller = new AbortController()
      controllerRef.current = controller
      dispatch({
        type: 'begin',
        fields: fields ?? FIELD_KEYS,
        full: fields === undefined,
      })

      let sawDone = false
      let sawError = false
      let timedOut = false
      let wentOffline = false
      let stallTimer: ReturnType<typeof setTimeout> | null = null

      const clearStallTimer = () => {
        if (stallTimer) {
          clearTimeout(stallTimer)
          stallTimer = null
        }
      }
      const armStallTimer = () => {
        clearStallTimer()
        stallTimer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, STALL_TIMEOUT_MS)
      }
      const handleOffline = () => {
        wentOffline = true
        controller.abort()
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('offline', handleOffline)
      }

      try {
        armStallTimer()
        const response = await fetch('/api/engine/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: trimmed,
            ...(fields ? { fields } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null)
          const parsedError = apiErrorSchema.safeParse(payload)
          const message = parsedError.success
            ? parsedError.data.message
            : `生成服务返回了 ${response.status} 状态。`
          const retryable = parsedError.success
            ? (parsedError.data.retryable ?? response.status >= 500)
            : response.status >= 500
          throw new GenerationFailure({
            code: parsedError.success ? parsedError.data.code : 'HTTP_ERROR',
            message,
            hint:
              response.status >= 500
                ? '服务暂时不可用，请稍后重试。已生成的内容不会丢失。'
                : '检查输入或服务状态后重试。已生成的内容不会丢失。',
            retryable,
          })
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('text/event-stream')) {
          throw new GenerationFailure({
            code: 'INVALID_RESPONSE',
            message: '生成服务没有返回事件流。',
            hint: '请稍后重试；如果问题持续，检查服务端日志。',
            retryable: true,
          })
        }
        if (!response.body) {
          throw new GenerationFailure({
            code: 'EMPTY_STREAM',
            message: '生成服务没有返回可读取的内容。',
            hint: '请稍后重试；如果问题持续，检查服务端日志。',
            retryable: true,
          })
        }

        for await (const message of parseSseStream(response.body)) {
          if (runIdRef.current !== runId) {
            return
          }
          armStallTimer()

          switch (message.event) {
            case 'stage':
              break

            case 'field': {
              if (message.data.status === 'start') {
                dispatch({ type: 'field-start', field: message.data.path })
              } else {
                dispatch({ type: 'field-done', field: message.data.path })
              }
              break
            }

            case 'delta': {
              const field = fieldFromPath(message.data.path)
              if (field) {
                dispatch({ type: 'delta', field, text: message.data.text })
              }
              break
            }

            case 'reasoning':
              dispatch({ type: 'reasoning', text: message.data.text })
              break

            case 'usage': {
              const usage: TokenUsage = {
                tokensIn: message.data.tokensIn,
                tokensOut: message.data.tokensOut,
                ...(message.data.cachedTokens !== undefined
                  ? { cachedTokens: message.data.cachedTokens }
                  : {}),
                ...(message.data.reasoningTokens !== undefined
                  ? { reasoningTokens: message.data.reasoningTokens }
                  : {}),
                ...(message.data.costCny !== undefined
                  ? { costCny: message.data.costCny }
                  : {}),
              }
              dispatch({ type: 'usage', usage })
              break
            }

            case 'error': {
              sawError = true
              const error: GenerationError = {
                code: message.data.code,
                message: message.data.message,
                hint: message.data.retryable
                  ? '可以重试未生成的字段。已生成的内容会保留。'
                  : '请检查输入或配置后重新生成。',
                retryable: message.data.retryable,
              }
              dispatch({
                type: 'fail',
                error,
                field:
                  message.data.field !== undefined &&
                  isFieldKey(message.data.field)
                    ? message.data.field
                    : undefined,
              })
              break
            }

            case 'done': {
              sawDone = true
              dispatch({
                type: 'done',
                title: message.data.title ?? '',
                assumptions: message.data.assumptions ?? [],
                durationMs: message.data.durationMs,
                finishReason: message.data.finishReason,
              })
              break
            }
          }
        }

        if (
          runIdRef.current === runId &&
          !sawDone &&
          !stopRequestedRef.current &&
          !sawError
        ) {
          dispatch({
            type: 'fail',
            error: {
              code: 'STREAM_INCOMPLETE',
              message: '生成连接提前结束，未收到完成事件。',
              hint: '已生成的内容会保留。可以重试未生成的字段。',
              retryable: true,
            },
          })
        }
      } catch (error) {
        if (runIdRef.current !== runId || stopRequestedRef.current) {
          return
        }
        if (timedOut) {
          dispatch({
            type: 'fail',
            error: {
              code: 'TIMEOUT',
              message: '生成服务超过 15 秒没有返回新数据。',
              hint: '已生成的内容会保留。检查网络或服务状态后，可以重试未生成的字段。',
              retryable: true,
            },
          })
          return
        }
        if (wentOffline) {
          dispatch({
            type: 'fail',
            error: {
              code: 'OFFLINE',
              message: '网络连接已断开。',
              hint: '已生成的内容会保留。恢复网络后，可以重试未生成的字段。',
              retryable: true,
            },
          })
          return
        }
        if (error instanceof GenerationFailure) {
          dispatch({ type: 'fail', error: error.detail })
          return
        }
        if (error instanceof SseParseError) {
          dispatch({
            type: 'fail',
            error: {
              code: 'INVALID_EVENT_STREAM',
              message: '生成服务返回的事件格式不符合协议。',
              hint: '已生成的内容会保留。请重试，如果问题持续请检查服务端。',
              retryable: true,
            },
          })
          return
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        dispatch({
          type: 'fail',
          error: {
            code: 'NETWORK_ERROR',
            message: '无法连接生成服务。',
            hint: '检查网络连接与服务是否启动后重试。已生成的内容会保留。',
            retryable: true,
          },
        })
      } finally {
        clearStallTimer()
        if (typeof window !== 'undefined') {
          window.removeEventListener('offline', handleOffline)
        }
        if (runIdRef.current === runId) {
          controllerRef.current = null
          activeRef.current = false
        }
      }
    },
    [],
  )

  const generate = useCallback((input: string) => run(input), [run])

  const retryFields = useCallback(
    (fields: readonly FieldKey[]): Promise<void> => {
      const input = lastInputRef.current
      if (!input || fields.length === 0) {
        return Promise.resolve()
      }
      return run(input, fields)
    },
    [run],
  )

  const runFieldOp = useCallback(
    async (field: FieldKey, action: FieldOp): Promise<void> => {
      if (activeRef.current || opActiveRef.current) {
        return
      }
      const current = state.doc.fields[field]
      if (!current || current.value.trim().length === 0) {
        return
      }

      opActiveRef.current = true
      const controller = new AbortController()
      opControllerRef.current = controller
      dispatch({ type: 'op-start', field, action })

      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, STALL_TIMEOUT_MS)

      let accumulated = ''
      let sawDone = false

      try {
        const response = await fetch('/api/engine/field', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field,
            action,
            text: current.value,
            ...(lastInputRef.current
              ? { requirement: lastInputRef.current }
              : {}),
            ...(state.title ? { title: state.title } : {}),
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null)
          const parsedError = apiErrorSchema.safeParse(payload)
          throw new GenerationFailure({
            code: parsedError.success ? parsedError.data.code : 'HTTP_ERROR',
            message: parsedError.success
              ? parsedError.data.message
              : `重算服务返回了 ${response.status} 状态。`,
            hint: '该字段保持原内容，可以稍后重试。',
            retryable: parsedError.success
              ? (parsedError.data.retryable ?? response.status >= 500)
              : response.status >= 500,
          })
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('text/event-stream') || !response.body) {
          throw new GenerationFailure({
            code: 'INVALID_RESPONSE',
            message: '重算服务没有返回事件流。',
            hint: '该字段保持原内容，请稍后重试。',
            retryable: true,
          })
        }

        for await (const message of parseSseStream(response.body)) {
          switch (message.event) {
            case 'delta':
              accumulated += message.data.text
              dispatch({ type: 'op-progress', field, text: accumulated })
              break
            case 'error':
              throw new GenerationFailure({
                code: message.data.code,
                message: message.data.message,
                hint: '该字段保持原内容，可以稍后重试。',
                retryable: message.data.retryable,
              })
            case 'done':
              sawDone = true
              break
            case 'stage':
            case 'field':
            case 'reasoning':
            case 'usage':
              break
          }
        }

        if (!sawDone || accumulated.trim().length === 0) {
          throw new GenerationFailure({
            code: 'STREAM_INCOMPLETE',
            message: '重算连接提前结束，未收到完整结果。',
            hint: '该字段保持原内容，可以稍后重试。',
            retryable: true,
          })
        }

        // 重置或卸载会让 controller 不再是当前请求，此时不能把旧结果写回新文档。
        if (opControllerRef.current !== controller) {
          return
        }
        dispatch({ type: 'field-rewrite', field, text: accumulated })
      } catch (error) {
        if (controller.signal.aborted && !timedOut) {
          return
        }
        if (timedOut) {
          dispatch({
            type: 'op-fail',
            field,
            message: '重算超过 15 秒没有返回结果，已保留原内容。',
          })
          return
        }
        if (error instanceof GenerationFailure) {
          dispatch({ type: 'op-fail', field, message: error.detail.message })
          return
        }
        if (error instanceof SseParseError) {
          dispatch({
            type: 'op-fail',
            field,
            message: '重算服务返回的事件格式不符合协议。',
          })
          return
        }
        dispatch({
          type: 'op-fail',
          field,
          message: '无法连接重算服务，已保留原内容。',
        })
      } finally {
        clearTimeout(timer)
        if (opControllerRef.current === controller) {
          opControllerRef.current = null
          opActiveRef.current = false
        }
      }
    },
    [state.doc, state.title],
  )

  const updateField = useCallback((field: FieldKey, text: string) => {
    dispatch({ type: 'edit', field, text })
  }, [])

  const acceptSuggestion = useCallback((field: FieldKey) => {
    dispatch({ type: 'accept-suggestion', field })
  }, [])

  const discardSuggestion = useCallback((field: FieldKey) => {
    dispatch({ type: 'discard-suggestion', field })
  }, [])

  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
  }, [])

  const redo = useCallback(() => {
    dispatch({ type: 'redo' })
  }, [])

  const stop = useCallback(() => {
    // 让当前请求立即失效，用户可以马上重试单个字段，不必等旧的 fetch 收尾。
    runIdRef.current += 1
    stopRequestedRef.current = true
    activeRef.current = false
    controllerRef.current?.abort()
    controllerRef.current = null
    dispatch({ type: 'stop' })
  }, [])

  const reset = useCallback(() => {
    runIdRef.current += 1
    stopRequestedRef.current = true
    controllerRef.current?.abort()
    controllerRef.current = null
    activeRef.current = false
    // 进行中的字段重算也要作废，否则它完成后会把旧文本写回新文档。
    opControllerRef.current?.abort()
    opControllerRef.current = null
    opActiveRef.current = false
    dispatch({ type: 'reset' })
  }, [])

  const fields = useMemo(() => toFieldViewMap(state.doc), [state.doc])
  const schema = useMemo(() => deriveDocSchema(state), [state])
  const runningOpField =
    FIELD_KEYS.find(
      (field) => state.fieldOps[field]?.status === 'running',
    ) ?? null
  const lastCommand =
    state.doc.history.length > 0
      ? (state.doc.history[state.doc.history.length - 1] ?? null)
      : null

  return {
    phase: state.phase,
    fields,
    scheduled: state.scheduled,
    title: state.title,
    assumptions: state.assumptions,
    durationMs: state.durationMs,
    error: state.error,
    usage: state.usage,
    reasoning: state.reasoning,
    isBusy: state.phase === 'streaming',
    canUndo: state.doc.history.length > 0,
    canRedo: state.doc.redo.length > 0,
    undoCount: state.doc.history.length,
    redoCount: state.doc.redo.length,
    lastCommand,
    schema,
    fieldOps: state.fieldOps,
    runningOpField,
    opBusy: runningOpField !== null,
    generate,
    retryFields,
    runFieldOp,
    updateField,
    acceptSuggestion,
    discardSuggestion,
    undo,
    redo,
    stop,
    reset,
  }
}
