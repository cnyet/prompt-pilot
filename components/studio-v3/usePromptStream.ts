'use client'

/**
 * 工作台流式请求 hook（Task 4）。
 *
 * run 接收一个返回原始 Response 的请求闭包，用 parseSseStreamV3 消费事件流
 * 并分发给 reducer；终态后用 fetchRecordDetail 拉详情并 dispatch settled。
 * 取消时先 dispatch abort 落草稿，再 abort 控制器并取消响应体，
 * 让服务端感知连接中断、把本轮迭代标记为已中断。
 */
import { useCallback, useRef, useState } from 'react'
import { parseSseStreamV3 } from '@/lib/engine/sse-v3'
import { ApiError, fetchRecordDetail } from './api'
import {
  initialStreamState,
  isRequestActive,
  streamReducer,
  type StreamAction,
  type StreamState,
} from './stream-reducer'

const SETTLE_ATTEMPTS = 3
const SETTLE_DELAY_MS = 150

const NETWORK_ERROR = {
  code: 'NETWORK',
  message: '连接服务失败，检查网络后重试。',
  retryable: true,
} as const

interface HttpErrorInfo {
  code: string
  message: string
  retryable: boolean
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 兜底解析非 2xx 响应；正常路径由 api.ts 的 requestStream 抛 ApiError。 */
async function readHttpError(response: Response): Promise<HttpErrorInfo> {
  const fallback: HttpErrorInfo = {
    code: 'INTERNAL',
    message: `请求失败（${response.status}）。`,
    retryable: response.status >= 500,
  }
  try {
    const body = (await response.json()) as {
      code?: unknown
      message?: unknown
      retryable?: unknown
    }
    return {
      code: typeof body.code === 'string' && body.code.length > 0 ? body.code : fallback.code,
      message:
        typeof body.message === 'string' && body.message.length > 0
          ? body.message
          : fallback.message,
      retryable:
        typeof body.retryable === 'boolean' ? body.retryable : fallback.retryable,
    }
  } catch {
    return fallback
  }
}

/**
 * 拉详情并结算。中断时服务端可能还在写库，本轮迭代仍是 running，
 * 短暂重试避免用旧的 latestOutput 覆盖刚保留的中断内容。
 */
async function settleDetail(
  recordId: string,
  iterationId: string | null,
  isCurrent: () => boolean,
  dispatch: (action: StreamAction) => void,
): Promise<void> {
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    try {
      const detail = await fetchRecordDetail(recordId)
      if (!isCurrent()) return
      const target = iterationId
        ? detail.record.iterations.find((iteration) => iteration.id === iterationId)
        : undefined
      if (target?.status !== 'running' || attempt === SETTLE_ATTEMPTS - 1) {
        dispatch({ type: 'settled', detail })
        return
      }
      await delay(SETTLE_DELAY_MS)
    } catch {
      // 详情拉取失败时保留流内结果；settling 保持 true，未知用量不写成 0
      return
    }
  }
}

export interface PromptStreamControls {
  state: StreamState
  run: (request: () => Promise<Response>) => Promise<void>
  cancel: () => void
  reset: () => void
  unavailable: () => void
}

export function usePromptStream(): PromptStreamControls {
  const [state, setState] = useState<StreamState>(initialStreamState)
  const stateRef = useRef<StreamState>(initialStreamState)
  const controllerRef = useRef<AbortController | null>(null)

  /** 同步更新 ref 与 state：cancel 需要读到当前 phase。 */
  const dispatch = useCallback((action: StreamAction) => {
    const next = streamReducer(stateRef.current, action)
    stateRef.current = next
    setState(next)
  }, [])

  const run = useCallback(
    async (request: () => Promise<Response>): Promise<void> => {
      // 同步守卫：start 事件到达前 phase 仍是 idle，controllerRef 防止双击起两条请求
      if (controllerRef.current || isRequestActive(stateRef.current.phase)) return

      const controller = new AbortController()
      controllerRef.current = controller
      const isCurrent = () => controllerRef.current === controller

      let recordId: string | null = null
      let iterationId: string | null = null
      let sawDone = false
      let draftLength = 0
      let detachAbort: (() => void) | null = null

      const finish = () => {
        detachAbort?.()
        detachAbort = null
        if (controllerRef.current === controller) controllerRef.current = null
      }

      let response: Response
      try {
        response = await request()
      } catch (error) {
        const current = isCurrent()
        finish()
        if (!current) return
        if (error instanceof ApiError) {
          if (error.status === 503 && error.code === 'NO_MODEL') {
            dispatch({ type: 'unavailable' })
          } else {
            dispatch({
              type: 'error',
              error: {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
              },
            })
          }
        } else if (!isAbortError(error)) {
          dispatch({ type: 'error', error: NETWORK_ERROR })
        }
        return
      }

      if (!isCurrent()) {
        // 已被 reset 或新请求接管：把这次响应体放掉，避免连接悬挂
        response.body?.cancel().catch(() => undefined)
        finish()
        return
      }

      if (!response.ok) {
        const info = await readHttpError(response)
        const current = isCurrent()
        finish()
        if (!current) return
        if (response.status === 503 && info.code === 'NO_MODEL') {
          dispatch({ type: 'unavailable' })
        } else {
          dispatch({ type: 'error', error: info })
        }
        return
      }

      const source = response.body
      if (!source) {
        const current = isCurrent()
        finish()
        if (!current) return
        dispatch({ type: 'stream-closed' })
        return
      }

      /*
       * parseSseStreamV3 会锁住传入的流，锁住之后 body.cancel() 会失败。
       * 这里先用一个转发流接管源 reader，abort 时直接取消源 reader，
       * pending read 立即结束，服务端也能感知连接中断。
       */
      const sourceReader = source.getReader()
      const cancelSource = () => {
        sourceReader.cancel().catch(() => undefined)
      }
      controller.signal.addEventListener('abort', cancelSource, { once: true })
      detachAbort = () => controller.signal.removeEventListener('abort', cancelSource)
      if (controller.signal.aborted) cancelSource()

      const parsedStream = new ReadableStream<Uint8Array>({
        async pull(parsedController) {
          try {
            const { done, value } = await sourceReader.read()
            if (done) {
              parsedController.close()
              return
            }
            parsedController.enqueue(value)
          } catch (error) {
            parsedController.error(error)
          }
        },
        cancel() {
          cancelSource()
        },
      })

      try {
        for await (const message of parseSseStreamV3(parsedStream)) {
          if (!isCurrent()) break
          // 停止后先拿到 start 以定位记录，再结束读取
          if (controller.signal.aborted && !sawDone && recordId !== null) break

          switch (message.event) {
            case 'start':
              recordId = message.data.recordId
              iterationId = message.data.iterationId
              dispatch({
                type: 'start',
                recordId: message.data.recordId,
                iterationId: message.data.iterationId,
              })
              break
            case 'delta':
              draftLength += message.data.text.length
              dispatch({ type: 'delta', text: message.data.text })
              break
            case 'meta':
              dispatch({ type: 'meta', notes: message.data.notes })
              break
            case 'usage':
              dispatch({ type: 'usage', usage: message.data })
              break
            case 'error':
              dispatch({ type: 'error', error: message.data })
              break
            case 'done':
              sawDone = true
              recordId = message.data.recordId
              iterationId = message.data.iterationId
              dispatch({ type: 'done', status: message.data.status })
              break
          }
        }
      } catch (error) {
        if (!isCurrent()) {
          finish()
          return
        }
        if (isAbortError(error) || controller.signal.aborted) {
          // 主动停止：保持 canceling，交给下面的收尾
        } else if (draftLength > 0) {
          dispatch({ type: 'done', status: 'canceled' })
        } else {
          dispatch({ type: 'stream-closed' })
        }
      } finally {
        detachAbort?.()
        detachAbort = null
      }

      if (!isCurrent()) {
        finish()
        return
      }

      if (controller.signal.aborted && !sawDone) {
        dispatch({ type: 'done', status: 'canceled' })
      } else if (!sawDone) {
        dispatch({ type: 'stream-closed' })
      }

      if (recordId) {
        await settleDetail(recordId, iterationId, isCurrent, dispatch)
      }

      finish()
    },
    [dispatch],
  )

  const cancel = useCallback(() => {
    const phase = stateRef.current.phase
    if (phase !== 'starting' && phase !== 'streaming') return
    dispatch({ type: 'abort' })
    controllerRef.current?.abort()
  }, [dispatch])

  const reset = useCallback(() => {
    const controller = controllerRef.current
    controllerRef.current = null
    controller?.abort()
    dispatch({ type: 'reset' })
  }, [dispatch])

  const unavailable = useCallback(() => dispatch({ type: 'unavailable' }), [dispatch])

  return { state, run, cancel, reset, unavailable }
}
