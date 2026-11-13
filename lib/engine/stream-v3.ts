/**
 * v3 SSE 流式装配（生成、继续优化、修复三条路由共用）。
 *
 * 事件序列：start、delta*、meta、usage?、done；失败时 error 后接 done(failed)。
 * 元数据由 MetaSplitter 边流边切分，分隔符与 JSON 永不进入 delta 与落库正文。
 * 记录层幂等由调用方传入的模块级 store 承担，迭代层由 requestId 唯一约束兜底。
 */
import {
  completeIteration,
  failIteration,
  findIterationByRequestId,
  getRecordWithIterations,
} from '@/lib/db/records'
import { getPrisma } from '@/lib/db/prisma'
import { createIdempotencyStore, type IdempotencyStore } from '@/lib/engine/idempotency'
import { MetaSplitter, type MetaResult } from '@/lib/engine/prompts/meta'
import {
  encodeSseEventV3,
  SSE_V3_HEADERS,
  type SseV3Message,
} from '@/lib/engine/sse-v3'
import { classifyError, createLlmError, errorCodeForKind } from '@/lib/llm/errors'
import { recordLlmCall } from '@/lib/llm/ledger'
import type { ChatRequest, LLMProvider, TokenUsage } from '@/lib/llm/types'

interface ErrorInfo {
  code: string
  message: string
  retryable: boolean
}

export interface StreamOutcome {
  /** true 表示本次调用已经向调用方实时推过事件，不需要重放。 */
  live: boolean
  recordId: string
  iterationId: string
  status: 'completed' | 'canceled' | 'failed'
  output: string
  meta: MetaResult & { title: string | null }
  usage: { tokensIn: number; tokensOut: number; costCny?: number; latencyMs?: number } | null
  error: ErrorInfo | null
}

export type StreamIdempotencyStore = IdempotencyStore<StreamOutcome>

export function createStreamIdempotencyStore(): StreamIdempotencyStore {
  return createIdempotencyStore<StreamOutcome>()
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message, retryable: false }, { status })
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  )
}

function usageIsKnown(usage: TokenUsage | undefined): usage is TokenUsage {
  if (!usage) return false
  return usage.costCny !== undefined || usage.tokensIn > 0 || usage.tokensOut > 0
}

function replayMessages(outcome: StreamOutcome): SseV3Message[] {
  const base = { recordId: outcome.recordId, iterationId: outcome.iterationId }
  const messages: SseV3Message[] = [{ event: 'start', data: base }]
  if (outcome.status === 'failed') {
    if (outcome.error) messages.push({ event: 'error', data: outcome.error })
    messages.push({ event: 'done', data: { ...base, status: 'failed' } })
    return messages
  }
  if (outcome.output.length > 0) {
    messages.push({ event: 'delta', data: { text: outcome.output } })
  }
  messages.push({
    event: 'meta',
    data: { title: outcome.meta.title, notes: outcome.meta.notes },
  })
  if (outcome.usage) messages.push({ event: 'usage', data: outcome.usage })
  messages.push({ event: 'done', data: { ...base, status: outcome.status } })
  return messages
}

/** 迭代层兜底：从已落库的迭代还原 outcome。 */
async function outcomeFromExistingIteration(requestId: string): Promise<StreamOutcome | null> {
  const iteration = await findIterationByRequestId(requestId)
  if (!iteration) return null
  const record = await getRecordWithIterations(iteration.recordId)
  const status =
    iteration.status === 'completed' || iteration.status === 'canceled'
      ? iteration.status
      : 'failed'
  let notes: string[] = []
  try {
    const parsed: unknown = JSON.parse(iteration.notesJson ?? '[]')
    if (Array.isArray(parsed)) {
      notes = parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    notes = []
  }
  const known = iteration.tokensIn !== null && iteration.tokensOut !== null
  return {
    live: false,
    recordId: iteration.recordId,
    iterationId: iteration.id,
    status,
    output: status === 'failed' ? '' : iteration.output,
    meta: { title: record?.title ?? null, notes },
    usage: known
      ? {
          tokensIn: iteration.tokensIn as number,
          tokensOut: iteration.tokensOut as number,
          ...(iteration.costCny !== null ? { costCny: iteration.costCny } : {}),
          ...(iteration.latencyMs !== null ? { latencyMs: iteration.latencyMs } : {}),
        }
      : null,
    error:
      status === 'failed'
        ? {
            code: 'LLM_UNKNOWN',
            message: '上一次请求失败，请重新发起一次。',
            retryable: true,
          }
        : null,
  }
}

export interface StreamV3Input {
  request: Request
  provider: LLMProvider
  /** 路由名，仅用于日志前缀。 */
  logTag: string
  stage: 'generate' | 'optimize' | 'repair'
  providerName: string
  modelId: string
  chatRequest: Omit<ChatRequest, 'signal'>
  /**
   * 创建迭代（生成路由同时建记录）。唯一约束冲突（P2002）直接抛出，
   * 本模块负责按 requestId 重放已有迭代；清理悬空记录由调用方在抛出前完成。
   */
  createIteration: () => Promise<{ recordId: string; iterationId: string }>
  /** 模型没有给出短标题时使用的标题。 */
  fallbackTitle: string
  /** false 时不改记录标题（继续优化、修复沿用原标题）。 */
  updateTitle: boolean
  requestId?: string | undefined
  store: StreamIdempotencyStore
}

export function streamV3(input: StreamV3Input): Response {
  const { request, provider, requestId } = input
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端可能已经断开
        }
      }
      const enqueue = (message: SseV3Message) => {
        if (closed || request.signal.aborted) return
        try {
          controller.enqueue(encoder.encode(encodeSseEventV3(message)))
        } catch {
          closed = true
        }
      }
      const onAbort = () => close()
      request.signal.addEventListener('abort', onAbort, { once: true })

      const execute = async (): Promise<StreamOutcome> => {
        let ids: { recordId: string; iterationId: string }
        try {
          ids = await input.createIteration()
        } catch (error) {
          if (isUniqueViolation(error) && requestId) {
            const existing = await outcomeFromExistingIteration(requestId)
            if (existing) return existing
          }
          throw error
        }
        enqueue({ event: 'start', data: ids })

        const chatRequest: ChatRequest = { ...input.chatRequest, signal: request.signal }
        const splitter = new MetaSplitter()
        const startedAt = Date.now()
        let ttftMs: number | null = null
        let body = ''
        let usage: TokenUsage | undefined
        let finishReason: string | null = null
        let failure: ErrorInfo | null = null

        const emitDelta = (text: string) => {
          if (text.length === 0) return
          body += text
          enqueue({ event: 'delta', data: { text } })
        }

        try {
          for await (const chunk of provider.stream(chatRequest)) {
            if (chunk.delta) {
              if (ttftMs === null) ttftMs = Date.now() - startedAt
              emitDelta(splitter.push(chunk.delta))
            }
            if (chunk.finishReason) finishReason = chunk.finishReason
            if (chunk.usage) usage = chunk.usage
          }
          if (!request.signal.aborted && finishReason === 'length') {
            throw createLlmError(
              'invalid_output',
              '模型输出被截断，没有拿到完整提示词，缩短输入后再试。',
            )
          }
        } catch (error) {
          if (!request.signal.aborted) {
            const llmError = classifyError(error, request.signal)
            failure = {
              code: errorCodeForKind(llmError.kind),
              message: llmError.message,
              retryable: llmError.retryable,
            }
          }
        }

        const latencyMs = Date.now() - startedAt
        const ledgerBase = {
          stage: input.stage,
          provider: input.providerName,
          modelId: input.modelId,
          thinking: 'off',
          recordId: ids.recordId,
          iterationId: ids.iterationId,
          latencyMs,
          ttftMs,
          finishReason,
        } as const

        const finishFailed = async (info: ErrorInfo): Promise<StreamOutcome> => {
          try {
            await failIteration({
              iterationId: ids.iterationId,
              recordId: ids.recordId,
              modelId: input.modelId,
              errorCode: info.code,
            })
          } catch (error) {
            console.warn(`[${input.logTag}] 写入失败迭代出错：`, error instanceof Error ? error.message : error)
          }
          await recordLlmCall({
            ...ledgerBase,
            status: 'failed',
            errorCode: info.code,
            ...(usage ? { usage } : {}),
          })
          enqueue({ event: 'error', data: info })
          enqueue({ event: 'done', data: { ...ids, status: 'failed' } })
          return {
            live: true,
            ...ids,
            status: 'failed',
            output: '',
            meta: { title: null, notes: [] },
            usage: null,
            error: info,
          }
        }

        if (failure) return finishFailed(failure)

        const canceled = request.signal.aborted
        let meta: MetaResult = { title: null, notes: [] }
        if (!canceled) {
          emitDelta(splitter.flushTail())
          meta = splitter.finish()
        }
        const title = input.updateTitle ? (meta.title ?? input.fallbackTitle) : input.fallbackTitle
        const status = canceled ? 'canceled' : 'completed'
        const knownUsage = usageIsKnown(usage) ? usage : undefined

        try {
          await completeIteration({
            iterationId: ids.iterationId,
            recordId: ids.recordId,
            output: body,
            notes: meta.notes,
            modelId: input.modelId,
            tokensIn: knownUsage ? knownUsage.tokensIn : null,
            tokensOut: knownUsage ? knownUsage.tokensOut : null,
            costCny: knownUsage?.costCny !== undefined ? knownUsage.costCny : null,
            latencyMs,
            status,
          })
          if (input.updateTitle && meta.title) {
            await getPrisma()
              ?.promptRecord.update({ where: { id: ids.recordId }, data: { title } })
              .catch(() => undefined)
          }
        } catch (error) {
          console.warn(`[${input.logTag}] 写入完成迭代出错：`, error instanceof Error ? error.message : error)
          return finishFailed({
            code: 'LLM_UNKNOWN',
            message: '结果没有保存成功，请重新发起一次。',
            retryable: true,
          })
        }
        if (!canceled) {
          enqueue({ event: 'meta', data: { title, notes: meta.notes } })
        }
        await recordLlmCall({
          ...ledgerBase,
          status: canceled ? 'canceled' : 'succeeded',
          ...(usage ? { usage } : {}),
        })

        const usagePayload =
          knownUsage && !canceled
            ? {
                tokensIn: knownUsage.tokensIn,
                tokensOut: knownUsage.tokensOut,
                ...(knownUsage.costCny !== undefined ? { costCny: knownUsage.costCny } : {}),
                latencyMs,
              }
            : null
        if (usagePayload) enqueue({ event: 'usage', data: usagePayload })
        enqueue({ event: 'done', data: { ...ids, status } })
        return {
          live: true,
          ...ids,
          status,
          output: body,
          meta: { title, notes: meta.notes },
          usage: usagePayload,
          error: null,
        }
      }

      try {
        let outcome: StreamOutcome
        let replayed = false
        if (requestId) {
          const result = await input.store.run(requestId, execute)
          outcome = result.value
          replayed = result.replayed
        } else {
          outcome = await execute()
        }
        if (replayed || !outcome.live) {
          for (const message of replayMessages(outcome)) enqueue(message)
        }
      } catch (error) {
        console.warn(`[${input.logTag}] 路由执行失败：`, error instanceof Error ? error.message : error)
        enqueue({
          event: 'error',
          data: {
            code: 'LLM_UNKNOWN',
            message: '生成没有完成，稍后重试。',
            retryable: true,
          },
        })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        close()
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, { headers: SSE_V3_HEADERS })
}
