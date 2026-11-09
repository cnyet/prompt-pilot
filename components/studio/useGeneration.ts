'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  FIELD_KEYS,
  type Assumption,
  type FieldKey,
} from '@/lib/engine/schema'
import {
  apiErrorSchema,
  isFieldKey,
  parseSseStream,
  SseParseError,
} from '@/lib/engine/sse'
import {
  createEmptyFields,
  createInitialState,
  type FieldViewMap,
  type GenerationError,
  type GenerationState,
} from './types'

const STALL_TIMEOUT_MS = 15_000

type Action =
  | { type: 'reset' }
  | { type: 'begin'; fields: readonly FieldKey[]; full: boolean }
  | { type: 'field-start'; field: FieldKey }
  | { type: 'delta'; field: FieldKey; text: string }
  | { type: 'field-done'; field: FieldKey }
  | { type: 'edit'; field: FieldKey; text: string }
  | { type: 'stop' }
  | { type: 'fail'; error: GenerationError; field?: FieldKey }
  | {
      type: 'done'
      title: string
      assumptions: Assumption[]
      durationMs: number
      finishReason: 'stop' | 'error' | 'aborted'
    }

function markFieldFailed(
  fields: FieldViewMap,
  field: FieldKey,
  message: string,
): FieldViewMap {
  const previous = fields[field]
  return {
    ...fields,
    [field]: { ...previous, status: 'failed', error: message },
  }
}

function reducer(state: GenerationState, action: Action): GenerationState {
  switch (action.type) {
    case 'reset':
      return createInitialState()

    case 'begin': {
      let fields: FieldViewMap
      if (action.full) {
        fields = createEmptyFields()
      } else {
        fields = { ...state.fields }
        for (const field of action.fields) {
          fields[field] = { status: 'idle', text: '', dirty: false }
        }
      }
      return {
        ...state,
        phase: 'streaming',
        fields,
        scheduled: action.fields,
        error: null,
        title: action.full ? '' : state.title,
        assumptions: action.full ? [] : state.assumptions,
        durationMs: action.full ? null : state.durationMs,
      }
    }

    case 'field-start': {
      const previous = state.fields[action.field]
      return {
        ...state,
        phase: 'streaming',
        fields: {
          ...state.fields,
          [action.field]: {
            ...previous,
            status: 'streaming',
            text: '',
            dirty: false,
            error: undefined,
          },
        },
      }
    }

    case 'delta': {
      const previous = state.fields[action.field]
      return {
        ...state,
        phase: 'streaming',
        fields: {
          ...state.fields,
          [action.field]: {
            ...previous,
            status: 'streaming',
            text: `${previous.text}${action.text}`,
            dirty: false,
          },
        },
      }
    }

    case 'field-done': {
      const previous = state.fields[action.field]
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...previous,
            status: 'done',
            text: previous.text.trimEnd(),
            dirty: false,
            error: undefined,
          },
        },
      }
    }

    case 'edit': {
      const previous = state.fields[action.field]
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...previous,
            text: action.text,
            dirty: true,
            status: previous.status === 'idle' ? 'partial' : previous.status,
          },
        },
      }
    }

    case 'stop': {
      const fields = { ...state.fields }
      for (const field of FIELD_KEYS) {
        if (fields[field].status === 'streaming') {
          fields[field] = {
            ...fields[field],
            status: 'partial',
            text: fields[field].text.trimEnd(),
          }
        }
      }
      return {
        ...state,
        phase: state.phase === 'streaming' ? 'stopped' : state.phase,
        fields,
      }
    }

    case 'fail': {
      let fields = state.fields
      if (action.field) {
        fields = markFieldFailed(fields, action.field, action.error.message)
      } else {
        for (const field of FIELD_KEYS) {
          if (fields[field].status === 'streaming') {
            fields = markFieldFailed(fields, field, action.error.message)
          }
        }
      }
      return { ...state, phase: 'error', fields, error: action.error }
    }

    case 'done': {
      const fields = { ...state.fields }
      if (action.finishReason !== 'error') {
        for (const field of FIELD_KEYS) {
          if (fields[field].status === 'streaming') {
            fields[field] = {
              ...fields[field],
              status: 'done',
              text: fields[field].text.trimEnd(),
            }
          }
        }
      }
      return {
        ...state,
        phase: action.finishReason === 'error' ? 'error' : 'done',
        fields,
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
  isBusy: boolean
  generate: (input: string) => Promise<void>
  retryFields: (fields: readonly FieldKey[]) => Promise<void>
  updateField: (field: FieldKey, text: string) => void
  stop: () => void
  reset: () => void
}

export function useGeneration(): GenerationApi {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
  const activeRef = useRef(false)
  const runIdRef = useRef(0)
  const lastInputRef = useRef('')
  const controllerRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)

  // 离开工作台时中止请求，避免服务端继续空转。
  useEffect(() => {
    return () => {
      activeRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const run = useCallback(
    async (input: string, fields?: readonly FieldKey[]): Promise<void> => {
      if (activeRef.current) {
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

  const updateField = useCallback((field: FieldKey, text: string) => {
    dispatch({ type: 'edit', field, text })
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
    dispatch({ type: 'reset' })
  }, [])

  return {
    phase: state.phase,
    fields: state.fields,
    scheduled: state.scheduled,
    title: state.title,
    assumptions: state.assumptions,
    durationMs: state.durationMs,
    error: state.error,
    isBusy: state.phase === 'streaming',
    generate,
    retryFields,
    updateField,
    stop,
    reset,
  }
}
