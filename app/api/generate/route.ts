/**
 * POST /api/generate：v3 首轮生成与优化（SSE）。
 *
 * 事件序列：start、delta*、meta、usage?、done；失败时 error 后接 done(failed)。
 * 元数据由 MetaSplitter 边流边切分，分隔符与 JSON 永不进入 delta 与落库正文。
 * 记录层幂等由模块级 store 承担，迭代层由 requestId 唯一约束兜底。
 */
import { z } from 'zod'
import {
  appendIteration,
  completeIteration,
  createRecord,
  failIteration,
  findIterationByRequestId,
  getRecordWithIterations,
} from '@/lib/db/records'
import { getPrisma } from '@/lib/db/prisma'
import { createIdempotencyStore } from '@/lib/engine/idempotency'
import { buildGenerateMessages } from '@/lib/engine/prompts/generate'
import { MetaSplitter, type MetaResult } from '@/lib/engine/prompts/meta'
import { buildOptimizeMessages } from '@/lib/engine/prompts/optimize'
import {
  encodeSseEventV3,
  SSE_V3_HEADERS,
  type SseV3Message,
} from '@/lib/engine/sse-v3'
import { classifyError, createLlmError, errorCodeForKind } from '@/lib/llm/errors'
import { recordLlmCall } from '@/lib/llm/ledger'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  getGenerateProvider,
  getModelConfig,
  getOptimizeProvider,
} from '@/lib/llm/registry'
import type { ChatRequest, TokenUsage } from '@/lib/llm/types'
import { getEffectiveLlmEnv } from '@/lib/settings/store'

export const dynamic = 'force-dynamic'

const MAX_GENERATE_CHARS = 2000
const MAX_OPTIMIZE_CHARS = 8000
const MAX_INSTRUCTION_CHARS = 500

const bodySchema = z
  .object({
    mode: z.enum(['generate', 'optimize']),
    sourceInput: z.string().min(1),
    instruction: z.string().min(1).max(MAX_INSTRUCTION_CHARS).optional(),
    targetType: z.enum(['text', 'image', 'video']).optional(),
    originTemplateId: z.string().min(1).optional(),
    requestId: z.string().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    const limit = value.mode === 'generate' ? MAX_GENERATE_CHARS : MAX_OPTIMIZE_CHARS
    if (value.sourceInput.length > limit) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceInput'],
        message: `输入不能超过 ${limit} 字。`,
      })
    }
  })

interface ErrorInfo {
  code: string
  message: string
  retryable: boolean
}

interface GenerateOutcome {
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

const idempotencyStore = createIdempotencyStore<GenerateOutcome>()

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message, retryable: false }, { status })
}

function isUniqueViolation(error: unknown): boolean {
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

function replayMessages(outcome: GenerateOutcome): SseV3Message[] {
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
async function outcomeFromExistingIteration(requestId: string): Promise<GenerateOutcome | null> {
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

export async function POST(request: Request): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, 'INVALID_INPUT', '请求体不是合法的 JSON。')
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first?.path.join('.') || '请求体'
    return jsonError(400, 'INVALID_INPUT', `输入不符合要求（${field}）：${first?.message ?? '格式错误'}`)
  }
  const input = parsed.data

  const env = await getEffectiveLlmEnv()
  const provider =
    input.mode === 'generate'
      ? getGenerateProvider(env, { allowValidMock: true })
      : getOptimizeProvider(env, { allowValidMock: true })
  if (!provider) {
    return jsonError(503, 'NO_MODEL', '未配置可用模型，先在设置里接入模型再试。')
  }

  const mode = input.mode
  const targetType = mode === 'generate' ? (input.targetType ?? 'text') : 'text'
  const modelConfigId =
    mode === 'generate' ? DEFAULT_GENERATE_MODEL_CONFIG_ID : DEFAULT_OPTIMIZE_MODEL_CONFIG_ID
  const modelConfig = getModelConfig(modelConfigId, env)
  const isMock = provider.id.startsWith('mock')
  const providerName = isMock ? 'mock' : (modelConfig?.provider ?? provider.id)
  const modelId = isMock ? 'mock' : (modelConfig?.modelId ?? provider.id)

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

      const execute = async (): Promise<GenerateOutcome> => {
        const record = await createRecord({
          mode,
          targetType,
          sourceInput: input.sourceInput,
          requestId: input.requestId ?? null,
          originTemplateId: input.originTemplateId ?? null,
        })
        let iteration
        try {
          iteration = await appendIteration({
            recordId: record.id,
            seq: 1,
            kind: mode,
            instruction: input.instruction ?? null,
            requestId: input.requestId ?? null,
          })
        } catch (error) {
          if (isUniqueViolation(error) && input.requestId) {
            const existing = await outcomeFromExistingIteration(input.requestId)
            if (existing) {
              // 本次多建的空记录没有迭代，清掉避免出现悬空记录
              await getPrisma()?.promptRecord.delete({ where: { id: record.id } }).catch(() => undefined)
              return existing
            }
          }
          throw error
        }

        const ids = { recordId: record.id, iterationId: iteration.id }
        enqueue({ event: 'start', data: ids })

        const { system, user } =
          mode === 'generate'
            ? buildGenerateMessages({ sourceInput: input.sourceInput, targetType })
            : buildOptimizeMessages({
                sourceInput: input.sourceInput,
                ...(input.instruction ? { instruction: input.instruction } : {}),
              })
        const chatRequest: ChatRequest = {
          modelConfigId,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          maxTokens: 8192,
          thinking: 'off',
          signal: request.signal,
        }

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
          stage: mode,
          provider: providerName,
          modelId,
          thinking: 'off',
          recordId: record.id,
          iterationId: iteration.id,
          latencyMs,
          ttftMs,
          finishReason,
        } as const

        if (failure) {
          try {
            await failIteration({
              iterationId: iteration.id,
              recordId: record.id,
              modelId,
              errorCode: failure.code,
            })
          } catch (error) {
            console.warn('[generate] 写入失败迭代出错：', error instanceof Error ? error.message : error)
          }
          await recordLlmCall({
            ...ledgerBase,
            status: 'failed',
            errorCode: failure.code,
            ...(usage ? { usage } : {}),
          })
          enqueue({ event: 'error', data: failure })
          enqueue({ event: 'done', data: { ...ids, status: 'failed' } })
          return {
            live: true,
            ...ids,
            status: 'failed',
            output: '',
            meta: { title: null, notes: [] },
            usage: null,
            error: failure,
          }
        }

        const canceled = request.signal.aborted
        let meta: MetaResult = { title: null, notes: [] }
        if (!canceled) {
          emitDelta(splitter.flushTail())
          meta = splitter.finish()
        }
        const title = meta.title ?? input.sourceInput.slice(0, 24)
        const status = canceled ? 'canceled' : 'completed'
        const knownUsage = usageIsKnown(usage) ? usage : undefined

        if (!canceled) {
          enqueue({ event: 'meta', data: { title, notes: meta.notes } })
        }
        try {
          await completeIteration({
            iterationId: iteration.id,
            recordId: record.id,
            output: body,
            notes: meta.notes,
            modelId,
            tokensIn: knownUsage ? knownUsage.tokensIn : null,
            tokensOut: knownUsage ? knownUsage.tokensOut : null,
            costCny: knownUsage?.costCny !== undefined ? knownUsage.costCny : null,
            latencyMs,
            status,
          })
          if (meta.title) {
            await getPrisma()
              ?.promptRecord.update({ where: { id: record.id }, data: { title } })
              .catch(() => undefined)
          }
        } catch (error) {
          console.warn('[generate] 写入完成迭代出错：', error instanceof Error ? error.message : error)
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
        let outcome: GenerateOutcome
        let replayed = false
        if (input.requestId) {
          const result = await idempotencyStore.run(input.requestId, execute)
          outcome = result.value
          replayed = result.replayed
        } else {
          outcome = await execute()
        }
        if (replayed || !outcome.live) {
          for (const message of replayMessages(outcome)) enqueue(message)
        }
      } catch (error) {
        console.warn('[generate] 路由执行失败：', error instanceof Error ? error.message : error)
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
