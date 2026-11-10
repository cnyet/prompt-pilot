'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { PromptVariable } from '@/lib/engine/schema'
import { apiErrorSchema, parseSseStream, SseParseError } from '@/lib/engine/sse'
import {
  deriveVariableFields,
  initialVariableValues,
  issuesToMap,
  validateVariableValues,
  type VariableField,
} from '@/lib/engine/variables'
import type { TokenUsage } from '@/lib/llm/types'
import type {
  TrialRunAvailability,
  TrialRunAction,
  TrialRunEstimate,
  TrialRunHistoryItem,
  TrialRunModelInfo,
  TrialRunPricing,
  TrialRunState,
} from './types'

const ESTIMATE_CHARS_PER_TOKEN = 1.5

export function createInitialTrialRunState(): TrialRunState {
  return {
    phase: 'idle',
    output: '',
    reasoning: '',
    usage: null,
    durationMs: null,
    finishReason: null,
    error: null,
    modelLabel: null,
  }
}

/**
 * 试运行状态的纯 reducer。
 *
 * 取消与失败都只改状态，不动 output，保证已经流出的内容一定还在。
 * 取消之后迟到的 delta、usage、done 全部忽略，避免「停止后又被追加一段」。
 */
export function trialRunReducer(
  state: TrialRunState,
  action: TrialRunAction,
): TrialRunState {
  switch (action.type) {
    case 'start':
      return {
        ...createInitialTrialRunState(),
        phase: 'running',
        modelLabel: action.modelLabel,
      }

    case 'delta': {
      if (state.phase !== 'running') {
        return state
      }
      return { ...state, output: state.output + action.text }
    }

    case 'reasoning': {
      if (state.phase !== 'running') {
        return state
      }
      return { ...state, reasoning: state.reasoning + action.text }
    }

    case 'usage': {
      if (state.phase !== 'running') {
        return state
      }
      return { ...state, usage: action.usage }
    }

    case 'finish': {
      if (state.phase === 'canceled') {
        return state
      }
      // 已经收到 error 事件时，迟到的 stop 不能把失败状态改回完成。
      const phase =
        action.finishReason === 'error' || state.error !== null
          ? 'failed'
          : action.finishReason === 'aborted'
            ? 'canceled'
            : 'done'
      return {
        ...state,
        phase,
        durationMs: action.durationMs,
        finishReason: action.finishReason,
      }
    }

    case 'cancel': {
      if (state.phase !== 'running') {
        return state
      }
      return {
        ...state,
        phase: 'canceled',
        durationMs: action.durationMs,
        finishReason: 'aborted',
        error: null,
      }
    }

    case 'fail': {
      if (state.phase === 'canceled') {
        return state
      }
      return {
        ...state,
        phase: 'failed',
        durationMs: action.durationMs,
        finishReason: 'error',
        error: action.message,
      }
    }

    case 'reset':
      return createInitialTrialRunState()
  }
}

/** 按字符数粗估 token，只在运行中且拿不到真实用量时展示为「约」。 */
export function estimateTokens(text: string): number {
  const chars = Array.from(text).length
  return chars === 0 ? 0 : Math.ceil(chars / ESTIMATE_CHARS_PER_TOKEN)
}

export function estimateTrialUsage(
  prompt: string,
  output: string,
  pricing: TrialRunPricing | undefined,
): TrialRunEstimate {
  const tokensIn = estimateTokens(prompt)
  const tokensOut = estimateTokens(output)
  if (!pricing) {
    return { tokensIn, tokensOut }
  }
  const inputPrice = pricing.inputCnyPerMillion
  const outputPrice = pricing.outputCnyPerMillion
  if (inputPrice === undefined || outputPrice === undefined) {
    return { tokensIn, tokensOut }
  }
  const cost =
    (tokensIn * inputPrice + tokensOut * outputPrice) / 1_000_000
  return {
    tokensIn,
    tokensOut,
    costCny: Math.round(cost * 1_000_000) / 1_000_000,
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function parsePricing(value: unknown): TrialRunPricing | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const input = readNumber(record.inputCnyPerMillion)
  const output = readNumber(record.outputCnyPerMillion)
  if (input === undefined || output === undefined) {
    return undefined
  }
  const cached = readNumber(record.cachedInputCnyPerMillion)
  return {
    inputCnyPerMillion: input,
    outputCnyPerMillion: output,
    ...(cached !== undefined ? { cachedInputCnyPerMillion: cached } : {}),
  }
}

function parseModel(value: unknown): TrialRunModelInfo | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record = value as Record<string, unknown>
  const providerId = readString(record.providerId)
  const modelId = readString(record.modelId)
  const label = readString(record.label)
  if (!providerId || !modelId || !label) {
    return null
  }
  const pricing = parsePricing(record.pricing)
  return {
    providerId,
    modelId,
    label,
    ...(pricing ? { pricing } : {}),
  }
}

function parseHistory(value: unknown): TrialRunHistoryItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: TrialRunHistoryItem[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const record = entry as Record<string, unknown>
    const id = readString(record.id)
    const status = readString(record.status)
    const output = readString(record.output)
    const createdAt = readString(record.createdAt)
    if (!id || !status || output === undefined || !createdAt) {
      continue
    }
    items.push({
      id,
      status,
      output,
      reasoning: readString(record.reasoning) ?? null,
      latencyMs: readNumber(record.latencyMs) ?? null,
      tokensIn: readNumber(record.tokensIn) ?? 0,
      tokensOut: readNumber(record.tokensOut) ?? 0,
      costCny: readNumber(record.costCny) ?? 0,
      createdAt,
      errorCode: readString(record.errorCode) ?? null,
      errorMsg: readString(record.errorMsg) ?? null,
    })
  }
  return items
}

export interface TrialRunAvailabilityPayload {
  availability: TrialRunAvailability
  runs: TrialRunHistoryItem[]
}

/** 解析 GET /api/run 的响应；格式不对时返回 null，由调用方显示探测失败。 */
export function parseTrialRunAvailability(
  payload: unknown,
): TrialRunAvailabilityPayload | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  if (typeof record.available !== 'boolean') {
    return null
  }
  const reason = readString(record.reason) ?? ''
  const model = parseModel(record.model)
  return {
    availability: {
      status: record.available ? 'ready' : 'unavailable',
      available: record.available,
      reason,
      model,
    },
    runs: parseHistory(record.runs),
  }
}

class TrialRunFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrialRunFailure'
  }
}

function variableRequestBody(
  fields: readonly VariableField[],
  values: Readonly<Record<string, string>>,
): Record<string, unknown>[] {
  return fields.map((field) => ({
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    value: values[field.name] ?? '',
    ...(field.options.length > 0 ? { options: [...field.options] } : {}),
    ...(field.description !== undefined
      ? { description: field.description }
      : {}),
  }))
}

function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `run_${uuid ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`
}

export interface UseTrialRunOptions {
  prompt: string
  variables: readonly PromptVariable[]
  sessionKey: string
  /** 生成进行中时禁止发起试运行，避免跑到一半的提示词。 */
  disabled?: boolean
}

export interface TrialRunApi {
  state: TrialRunState
  fields: readonly VariableField[]
  values: Record<string, string>
  errors: Record<string, string>
  availability: TrialRunAvailability
  history: readonly TrialRunHistoryItem[]
  isRunning: boolean
  canRun: boolean
  elapsedMs: number
  /** 运行中且尚未收到 usage 时的估算值；收到真实用量后为 null。 */
  estimate: TrialRunEstimate | null
  setValue: (name: string, value: string) => void
  run: () => Promise<void>
  cancel: () => void
  reset: () => void
  refresh: () => void
}

export function useTrialRun(options: UseTrialRunOptions): TrialRunApi {
  const { prompt, variables, sessionKey, disabled = false } = options
  const [state, dispatch] = useReducer(
    trialRunReducer,
    undefined,
    createInitialTrialRunState,
  )
  const [rawValues, setRawValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [availability, setAvailability] = useState<TrialRunAvailability>({
    status: 'loading',
    available: false,
    reason: '正在确认可用模型。',
    model: null,
  })
  const [history, setHistory] = useState<TrialRunHistoryItem[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [clock, setClock] = useState(0)

  const controllerRef = useRef<AbortController | null>(null)
  const startedAtRef = useRef(0)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fields = useMemo(() => deriveVariableFields(variables), [variables])

  const values = useMemo(() => {
    const next = initialVariableValues(fields)
    for (const field of fields) {
      const raw = rawValues[field.name]
      if (raw !== undefined) {
        next[field.name] = raw
      }
    }
    return next
  }, [fields, rawValues])

  // 可用性与最近运行一起取：进入工作台就知道按钮能不能点。
  useEffect(() => {
    const controller = new AbortController()
    setAvailability((previous) =>
      previous.available
        ? previous
        : {
            ...previous,
            status: 'loading',
            reason: '正在确认可用模型。',
          },
    )
    const query =
      sessionKey.length > 0
        ? `?sessionKey=${encodeURIComponent(sessionKey)}`
        : ''
    fetch(`/api/run${query}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`可用性检查返回了 ${response.status} 状态。`)
        }
        const payload: unknown = await response.json()
        const parsed = parseTrialRunAvailability(payload)
        if (!parsed) {
          throw new Error('可用性检查返回的数据格式不符合预期。')
        }
        setAvailability(parsed.availability)
        setHistory(parsed.runs)
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return
        }
        setAvailability({
          status: 'error',
          available: false,
          reason: '无法确认模型可用性，检查网络后重试。',
          model: null,
        })
      })
    return () => controller.abort()
  }, [sessionKey, refreshToken])

  useEffect(() => {
    if (state.phase !== 'running') {
      return
    }
    setClock(Date.now())
    const timer = setInterval(() => {
      setClock(Date.now())
    }, 100)
    return () => clearInterval(timer)
  }, [state.phase])

  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  const scheduleHistoryRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      setRefreshToken((token) => token + 1)
    }, 500)
  }, [])

  const setValue = useCallback((name: string, value: string) => {
    setRawValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => {
      if (previous[name] === undefined) {
        return previous
      }
      const next = { ...previous }
      delete next[name]
      return next
    })
  }, [])

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    dispatch({
      type: 'cancel',
      durationMs: Date.now() - startedAtRef.current,
    })
    scheduleHistoryRefresh()
  }, [scheduleHistoryRefresh])

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1)
  }, [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    dispatch({ type: 'reset' })
  }, [])

  const run = useCallback(async () => {
    if (state.phase === 'running' || disabled || controllerRef.current !== null) {
      return
    }
    if (!availability.available) {
      dispatch({
        type: 'fail',
        message: availability.reason || '没有可用模型。',
        durationMs: 0,
      })
      return
    }
    const trimmedPrompt = prompt.trim()
    if (trimmedPrompt.length === 0) {
      dispatch({
        type: 'fail',
        message: '提示词还是空的，先生成内容再试运行。',
        durationMs: 0,
      })
      return
    }

    const issues = validateVariableValues(fields, values)
    if (issues.length > 0) {
      setErrors(issuesToMap(issues))
      const first = issues[0]
      if (first && typeof document !== 'undefined') {
        document.getElementById(`run-var-${first.name}`)?.focus()
      }
      return
    }
    setErrors({})

    const controller = new AbortController()
    controllerRef.current = controller
    startedAtRef.current = Date.now()
    setClock(Date.now())
    dispatch({
      type: 'start',
      modelLabel: availability.model?.label ?? '未指定模型',
    })

    let sawDone = false
    let sawError = false

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          variables: variableRequestBody(fields, values),
          sessionKey,
          requestId: newRequestId(),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        const parsedError = apiErrorSchema.safeParse(payload)
        throw new TrialRunFailure(
          parsedError.success
            ? parsedError.data.message
            : `试运行服务返回了 ${response.status} 状态。`,
        )
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream') || !response.body) {
        throw new TrialRunFailure('试运行服务没有返回事件流。')
      }

      for await (const message of parseSseStream(response.body)) {
        switch (message.event) {
          case 'stage':
            break

          case 'delta':
            dispatch({ type: 'delta', text: message.data.text })
            break

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

          case 'error':
            sawError = true
            dispatch({
              type: 'fail',
              message: message.data.message,
              durationMs: Date.now() - startedAtRef.current,
            })
            break

          case 'done': {
            sawDone = true
            dispatch({
              type: 'finish',
              durationMs: message.data.durationMs,
              finishReason: message.data.finishReason,
            })
            break
          }
        }
      }

      if (
        !sawDone &&
        !sawError &&
        !controller.signal.aborted &&
        controllerRef.current === controller
      ) {
        dispatch({
          type: 'fail',
          message: '试运行连接提前结束，已保留收到的内容。',
          durationMs: Date.now() - startedAtRef.current,
        })
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      if (error instanceof TrialRunFailure) {
        dispatch({
          type: 'fail',
          message: error.message,
          durationMs: Date.now() - startedAtRef.current,
        })
        return
      }
      if (error instanceof SseParseError) {
        dispatch({
          type: 'fail',
          message: '试运行返回的事件格式不符合协议。',
          durationMs: Date.now() - startedAtRef.current,
        })
        return
      }
      dispatch({
        type: 'fail',
        message: '无法连接试运行服务，请检查网络后重试。',
        durationMs: Date.now() - startedAtRef.current,
      })
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
      scheduleHistoryRefresh()
    }
  }, [
    availability.available,
    availability.model,
    availability.reason,
    disabled,
    fields,
    prompt,
    scheduleHistoryRefresh,
    sessionKey,
    state.phase,
    values,
  ])

  const elapsedMs =
    state.phase === 'running'
      ? Math.max(0, clock - startedAtRef.current)
      : (state.durationMs ?? 0)

  const estimate = useMemo(() => {
    if (state.phase !== 'running' || state.usage !== null) {
      return null
    }
    return estimateTrialUsage(prompt, state.output, availability.model?.pricing)
  }, [availability.model, prompt, state.output, state.phase, state.usage])

  return {
    state,
    fields,
    values,
    errors,
    availability,
    history,
    isRunning: state.phase === 'running',
    canRun:
      availability.available &&
      !disabled &&
      state.phase !== 'running' &&
      prompt.trim().length > 0,
    elapsedMs,
    estimate,
    setValue,
    run,
    cancel,
    reset,
    refresh,
  }
}
