import { z } from 'zod'
import { VARIABLE_TYPES, type PromptVariable } from '@/lib/engine/schema'
import {
  SSE_HEADERS,
  encodeSseEvent,
  type SseMessage,
} from '@/lib/engine/sse'
import {
  deriveVariableFields,
  extractVariableNames,
  serializeVariableValues,
  substituteVariables,
  validateVariableValues,
} from '@/lib/engine/variables'
import { listRecentRuns, recordRun, type RunStatus } from '@/lib/db/runs'
import {
  classifyError,
  createLlmError,
  errorCodeForKind,
} from '@/lib/llm/errors'
import {
  computeCostCny,
  instrumentProvider,
  resolveTraceId,
  type LlmCallContext,
  type ModelPricingCny,
} from '@/lib/llm/ledger'
import { MockProvider, createValidMockProvider } from '@/lib/llm/mock'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  MOCK_FAULT_ENV,
  getGenerateProvider,
  getModelConfig,
} from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'
import type {
  ChatChunk,
  ChatRequest,
  FinishReason,
  LLMProvider,
  TokenUsage,
} from '@/lib/llm/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_MODEL_REASON =
  '没有可用模型：未配置 ARK_API_KEY，也没有注入 Mock 模型。配置密钥后即可试运行。'

const FREE_PRICING: ModelPricingCny = {
  inputCnyPerMillion: 0,
  cachedInputCnyPerMillion: 0,
  outputCnyPerMillion: 0,
}

/**
 * 只有显式设置 MOCK_LLM_FAULT=valid 时才注入这份可用的 Mock 脚本。
 * 生产不设置该变量，因此不会伪造输出；无 Key 且无注入时路由直接拒绝运行。
 */


const MEMBER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

const variableInputSchema = z.object({
  name: z.string().regex(MEMBER_NAME, '变量名只能包含字母、数字与下划线'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(VARIABLE_TYPES),
  required: z.boolean().default(true),
  value: z.string().max(20_000, '变量内容不能超过 20000 个字符。'),
  options: z
    .array(z.string().max(200, '选项不能超过 200 个字符。'))
    .max(50, '选项不能超过 50 个。')
    .optional(),
  description: z.string().trim().max(200).optional(),
})

const runRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, '提示词不能为空。')
    .max(200_000, '提示词不能超过 200000 个字符。'),
  variables: z.array(variableInputSchema).max(50, '变量不能超过 50 个。').default([]),
  sessionKey: z
    .string()
    .trim()
    .min(1, '缺少草稿标识。')
    .max(128, '草稿标识过长。'),
  requestId: z.string().trim().max(128, '请求标识过长。').optional(),
  params: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().max(65_536).optional(),
    })
    .optional(),
})

type RunRequest = z.infer<typeof runRequestSchema>
type VariableInput = z.infer<typeof variableInputSchema>

interface ResolvedRunModel {
  provider: LLMProvider
  providerId: string
  modelId: string
  label: string
  contextWindow?: number
  pricing?: ModelPricingCny
}

interface FetchAttemptCounter {
  fetch: typeof globalThis.fetch
  count: () => number
}

/** 与 generate 路由相同的做法：统计 provider 内部重试实际发出的 HTTP 次数。 */
function createFetchAttemptCounter(): FetchAttemptCounter {
  let count = 0
  const countedFetch: typeof globalThis.fetch = (input, init) => {
    count += 1
    return globalThis.fetch(input, init)
  }
  return { fetch: countedFetch, count: () => count }
}

function resolveRunModel(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof globalThis.fetch,
): ResolvedRunModel | null {
  const config = getModelConfig(DEFAULT_GENERATE_MODEL_CONFIG_ID, env)
  const provider = getGenerateProvider(
    env,
    fetchImpl ? { fetch: fetchImpl } : {},
  )
  if (provider) {
    const isMock = provider.id.startsWith('mock')
    return {
      provider,
      providerId: isMock ? 'mock' : (config?.provider ?? provider.id),
      modelId: isMock ? 'mock' : (config?.modelId ?? provider.id),
      label: provider.label,
      ...(config?.contextWindow !== undefined
        ? { contextWindow: config.contextWindow }
        : {}),
      ...(isMock
        ? { pricing: FREE_PRICING }
        : config?.pricing
          ? { pricing: config.pricing }
          : {}),
    }
  }

  // 测试与本地验收的显式注入：没有 Key 时也能走完整条试运行链路。
  if (env[MOCK_FAULT_ENV]?.trim() === 'valid') {
    return {
      provider: createValidMockProvider(),
      providerId: 'mock',
      modelId: 'mock',
      label: 'Mock 模型 · valid',
      pricing: FREE_PRICING,
    }
  }

  return null
}

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  detail?: unknown,
): Response {
  return new Response(JSON.stringify({ code, message, detail, retryable }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function toPromptVariable(input: VariableInput): PromptVariable {
  const variable: PromptVariable = {
    name: input.name,
    label: input.label,
    type: input.type,
    required: input.required,
  }
  if (input.options !== undefined) {
    variable.options = [...input.options]
  }
  if (input.description !== undefined) {
    variable.description = input.description
  }
  return variable
}

function withCost(
  usage: TokenUsage,
  pricing: ModelPricingCny | undefined,
): TokenUsage {
  if (usage.costCny !== undefined || pricing === undefined) {
    return usage
  }
  const costCny = computeCostCny(usage, pricing)
  return costCny === undefined ? usage : { ...usage, costCny }
}

function newRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `run_${uuid ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}`
}

function paramsOf(request: RunRequest): {
  temperature: number
  maxTokens: number
  thinking: 'off'
} {
  return {
    temperature: request.params?.temperature ?? 0.7,
    maxTokens: request.params?.maxTokens ?? 4096,
    thinking: 'off',
  }
}

function buildChatRequest(
  request: RunRequest,
  promptText: string,
): ChatRequest {
  const params = paramsOf(request)
  return {
    modelConfigId: DEFAULT_GENERATE_MODEL_CONFIG_ID,
    messages: [
      {
        role: 'system',
        content:
          '你正在执行一份结构化提示词。严格遵循其中的角色、目标、约束与输出格式，直接给出最终结果。',
      },
      { role: 'user', content: promptText },
    ],
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    thinking: params.thinking,
    cacheKey: request.sessionKey,
  }
}

/**
 * 试运行可用性：客户端据此决定运行按钮是否可用，并在不可用时展示原因。
 * 同时带回当前草稿的最近运行，支持在同一会话里回看。
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const sessionKey = url.searchParams.get('sessionKey')?.trim() ?? ''
  const env = await getEffectiveLlmEnv()
  const resolved = resolveRunModel(env)
  const runs = sessionKey.length > 0 ? await listRecentRuns(sessionKey) : []

  return Response.json(
    {
      available: resolved !== null,
      reason: resolved ? '' : NO_MODEL_REASON,
      model:
        resolved === null
          ? null
          : {
              providerId: resolved.providerId,
              modelId: resolved.modelId,
              label: resolved.label,
              ...(resolved.pricing ? { pricing: resolved.pricing } : {}),
            },
      runs,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', '请求体不是合法 JSON。', false)
  }

  const parsed = runRequestSchema.safeParse(payload)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return jsonError(
      400,
      'INVALID_INPUT',
      firstIssue?.message ?? '请求参数不合法。',
      true,
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }

  const input = parsed.data
  const variables = input.variables.map(toPromptVariable)
  const fields = deriveVariableFields(variables)
  const values: Record<string, string> = {}
  for (const variable of input.variables) {
    values[variable.name] = variable.value
  }

  // 服务端再校验一次，避免绕过界面带着空值运行。
  const issues = validateVariableValues(fields, values)
  if (issues.length > 0) {
    return jsonError(
      400,
      'INVALID_VARIABLES',
      `还有 ${issues.length} 个变量需要处理。`,
      true,
      issues,
    )
  }

  const undeclared = extractVariableNames(input.prompt).filter(
    (name) => !fields.some((field) => field.name === name),
  )
  if (undeclared.length > 0) {
    return jsonError(
      400,
      'UNDECLARED_VARIABLES',
      `提示词里有未声明的变量：${undeclared.join('、')}。`,
      true,
      undeclared.map((name) => ({ name })),
    )
  }

  const fetchCounter = createFetchAttemptCounter()
  const env = await getEffectiveLlmEnv()
  const resolved = resolveRunModel(env, fetchCounter.fetch)
  if (!resolved) {
    return jsonError(503, 'NO_MODEL', NO_MODEL_REASON, false)
  }

  const promptText = substituteVariables(input.prompt, fields, values)
  const chatRequest = buildChatRequest(input, promptText)
  const params = paramsOf(input)
  const requestId = input.requestId ?? newRequestId()
  const traceId = resolveTraceId(requestId)
  const ledgerContext: LlmCallContext = {
    traceId,
    stage: 'run',
    provider: resolved.providerId,
    modelId: resolved.modelId,
    thinking: params.thinking,
    ...(resolved.contextWindow !== undefined
      ? { contextWindow: resolved.contextWindow }
      : {}),
    fetchAttempts: fetchCounter.count,
  }
  const provider = instrumentProvider(resolved.provider, ledgerContext)

  const encoder = new TextEncoder()
  const startedAt = Date.now()
  let closed = false
  let output = ''
  let reasoning = ''
  let usage: TokenUsage | undefined
  let finishReason: FinishReason = null
  let failureCode: string | undefined
  let failureMessage: string | undefined
  let recordPromise: Promise<string | null> | null = null

  const finalize = (status: RunStatus): Promise<string | null> => {
    if (recordPromise !== null) {
      return recordPromise
    }
    const errorCode =
      status === 'canceled' ? 'CANCELED' : failureCode
    const errorMsg =
      status === 'canceled' ? '用户取消了本次试运行。' : failureMessage
    recordPromise = recordRun({
      sessionKey: input.sessionKey,
      variablesJson: serializeVariableValues(fields, values),
      modelId: resolved.modelId,
      paramsJson: JSON.stringify(params),
      output,
      ...(reasoning.length > 0 ? { reasoning } : {}),
      status,
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(errorMsg !== undefined ? { errorMsg } : {}),
      latencyMs: Date.now() - startedAt,
      ...(usage ? { usage } : {}),
      ...(finishReason !== null ? { finishReason } : {}),
      traceId,
      requestId,
      cacheKey: input.sessionKey,
    })
    return recordPromise
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端可能已经断开
        }
      }

      const enqueue = (message: SseMessage) => {
        if (closed || request.signal.aborted) {
          return
        }
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(message)))
        } catch {
          closed = true
        }
      }

      const onAbort = () => {
        closed = true
        void finalize('canceled')
        try {
          controller.close()
        } catch {
          // 客户端已断开
        }
      }
      request.signal.addEventListener('abort', onAbort, { once: true })

      try {
        // sse.ts 的 stage 枚举只包含引擎阶段，试运行沿用 compose 表示一次
        // 生成调用，label 明确告诉用户当前是试运行。
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在试运行' },
        })

        for await (const chunk of provider.stream({
          ...chatRequest,
          signal: request.signal,
        })) {
          if (closed || request.signal.aborted) {
            break
          }
          if (chunk.reasoningDelta !== undefined) {
            reasoning += chunk.reasoningDelta
            enqueue({ event: 'reasoning', data: { text: chunk.reasoningDelta } })
          }
          if (chunk.usage !== undefined) {
            usage = withCost(chunk.usage, resolved.pricing)
            // 完全拿不到用量时不发 usage 事件，界面显示「未知」而不是 0。
            const hasDetail =
              usage.costCny !== undefined ||
              usage.cachedTokens !== undefined ||
              usage.reasoningTokens !== undefined
            if (hasDetail || usage.tokensIn > 0 || usage.tokensOut > 0) {
              enqueue({
                event: 'usage',
                data: {
                  tokensIn: usage.tokensIn,
                  tokensOut: usage.tokensOut,
                  ...(usage.cachedTokens !== undefined
                    ? { cachedTokens: usage.cachedTokens }
                    : {}),
                  ...(usage.reasoningTokens !== undefined
                    ? { reasoningTokens: usage.reasoningTokens }
                    : {}),
                  ...(usage.costCny !== undefined
                    ? { costCny: usage.costCny }
                    : {}),
                  model: resolved.modelId,
                },
              })
            }
          }
          if (chunk.finishReason !== undefined) {
            finishReason = chunk.finishReason
          }
          if (chunk.delta.length > 0) {
            output += chunk.delta
            enqueue({
              event: 'delta',
              data: { path: 'output', text: chunk.delta },
            })
          }
        }

        if (request.signal.aborted || closed) {
          await finalize('canceled')
          return
        }

        if (output.trim().length === 0) {
          const error = createLlmError(
            'invalid_output',
            '模型没有返回任何内容，请重试。',
          )
          failureCode = errorCodeForKind(error.kind)
          failureMessage = error.message
          enqueue({
            event: 'error',
            data: {
              code: failureCode,
              message: failureMessage,
              retryable: true,
              attempt: 1,
            },
          })
          enqueue({
            event: 'done',
            data: {
              durationMs: Date.now() - startedAt,
              finishReason: 'error',
            },
          })
          await finalize('failed')
          return
        }

        if (finishReason === null && usage === undefined) {
          failureCode = 'LLM_STREAM_INTERRUPTED'
          failureMessage = '模型连接提前结束，已保留收到的内容。'
          enqueue({
            event: 'error',
            data: {
              code: failureCode,
              message: failureMessage,
              retryable: true,
              attempt: 1,
            },
          })
          enqueue({
            event: 'done',
            data: {
              durationMs: Date.now() - startedAt,
              finishReason: 'error',
            },
          })
          await finalize('failed')
          return
        }

        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'done', label: '试运行完成' },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'stop',
          },
        })
        await finalize('succeeded')
      } catch (error) {
        if (request.signal.aborted) {
          await finalize('canceled')
          return
        }
        const llmError = classifyError(error)
        failureCode = errorCodeForKind(llmError.kind)
        failureMessage = llmError.message
        enqueue({
          event: 'error',
          data: {
            code: failureCode,
            message: failureMessage,
            retryable: llmError.retryable,
            attempt: 1,
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
          },
        })
        await finalize('failed')
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        close()
      }
    },
    async cancel() {
      closed = true
      await finalize('canceled')
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS },
  })
}
