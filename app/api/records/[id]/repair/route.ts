/**
 * POST /api/records/[id]/repair：按检查结果修复（SSE，追加迭代）。
 * 以记录当前结果为原文，issues 可为空（走通用优化）；running 的记录拒绝并发。
 */
import { z } from 'zod'
import { appendIteration, getRecordWithIterations } from '@/lib/db/records'
import { buildRepairMessages } from '@/lib/engine/prompts/repair'
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

const issueSchema = z.object({
  id: z.string().min(1).max(100),
  level: z.enum(['error', 'warn', 'info']),
  message: z.string().max(200),
  suggestion: z.string().max(200).nullable(),
})

const bodySchema = z.object({
  issues: z.array(issueSchema).max(20),
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
  if (record.status === 'running') {
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
  const { system, user } = buildRepairMessages({
    sourceInput: record.latestOutput,
    issues: input.issues,
  })

  return streamV3({
    request,
    provider,
    logTag: 'record-repair',
    stage: 'repair',
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
        kind: 'repair',
        requestId: input.requestId ?? null,
      })
      return { recordId: record.id, iterationId: iteration.id }
    },
  })
}
