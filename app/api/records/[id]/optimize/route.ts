/**
 * POST /api/records/[id]/optimize：继续优化（SSE，追加迭代）。
 * 在记录当前结果上继续，继承目标类型；有进行中迭代的记录拒绝并发。
 */
import { z } from 'zod'
import { appendIteration, getRecordWithIterations } from '@/lib/db/records'
import { buildOptimizeMessages } from '@/lib/engine/prompts/optimize'
import {
  createStreamIdempotencyStore,
  jsonError,
  streamV3,
} from '@/lib/engine/stream-v3'
import {
  DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  getModelConfig,
  getOptimizeProvider,
} from '@/lib/llm/registry'
import { getEffectiveLlmEnv } from '@/lib/settings/store'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  instruction: z.string().min(1).max(500).optional(),
  requestId: z.string().min(1).max(200).optional(),
})

const idempotencyStore = createStreamIdempotencyStore()

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params
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

  const record = await getRecordWithIterations(id)
  if (!record) return jsonError(404, 'RECORD_NOT_FOUND', '没有找到这条记录。')
  if (record.status === 'running' || record.iterations.some((it) => it.status === 'running')) {
    return Response.json(
      { code: 'ITERATION_IN_FLIGHT', message: '这一条正在处理，等它完成再继续。', retryable: false },
      { status: 409 },
    )
  }

  const env = await getEffectiveLlmEnv()
  const provider = getOptimizeProvider(env, { allowValidMock: true })
  if (!provider) {
    return jsonError(503, 'NO_MODEL', '未配置可用模型，先在设置里接入模型再试。')
  }
  const modelConfigId = DEFAULT_OPTIMIZE_MODEL_CONFIG_ID
  const modelConfig = getModelConfig(modelConfigId, env)
  const isMock = provider.id.startsWith('mock')
  const { system, user } = buildOptimizeMessages({
    sourceInput: record.latestOutput,
    ...(input.instruction ? { instruction: input.instruction } : {}),
  })

  return streamV3({
    request,
    provider,
    logTag: 'record-optimize',
    stage: 'optimize',
    providerName: isMock ? 'mock' : (modelConfig?.provider ?? provider.id),
    modelId: isMock ? 'mock' : (modelConfig?.modelId ?? provider.id),
    chatRequest: {
      modelConfigId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 8192,
      thinking: 'off',
    },
    fallbackTitle: record.title,
    updateTitle: false,
    requestId: input.requestId,
    store: idempotencyStore,
    createIteration: async () => {
      const iteration = await appendIteration({
        recordId: record.id,
        seq: record.iterations.length + 1,
        kind: 'optimize',
        instruction: input.instruction ?? null,
        requestId: input.requestId ?? null,
      })
      return { recordId: record.id, iterationId: iteration.id }
    },
  })
}
