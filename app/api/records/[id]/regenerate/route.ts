/**
 * POST /api/records/[id]/regenerate：重新生成（SSE，追加迭代）。
 *
 * 以记录的原始输入重新走生成；失败或空输出的记录也允许重新生成
 * （不设 RECORD_HAS_NO_OUTPUT 守卫）。有进行中迭代的记录拒绝并发。
 */
import { z } from 'zod'
import { appendIteration, getRecordWithIterations } from '@/lib/db/records'
import { buildGenerateMessages } from '@/lib/engine/prompts/generate'
import type { TargetTypeV3 } from '@/lib/engine/prompts/shared'
import {
  createStreamIdempotencyStore,
  jsonError,
  streamV3,
} from '@/lib/engine/stream-v3'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  getGenerateProvider,
  getModelConfig,
} from '@/lib/llm/registry'
import { getEffectiveLlmEnv, getEffectiveModelParams } from '@/lib/settings/store'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
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
    return jsonError(409, 'ITERATION_IN_FLIGHT', '这一条正在处理，等它完成再继续。')
  }

  const env = await getEffectiveLlmEnv()
  const provider = getGenerateProvider(env, { allowValidMock: true })
  if (!provider) {
    return jsonError(503, 'NO_MODEL', '未配置可用模型，先在设置里接入模型再试。')
  }
  const modelConfigId = DEFAULT_GENERATE_MODEL_CONFIG_ID
  const modelConfig = getModelConfig(modelConfigId, env)
  const isMock = provider.id.startsWith('mock')
  const params = await getEffectiveModelParams('generate')
  const { system, user } = buildGenerateMessages({
    sourceInput: record.sourceInput,
    targetType: record.targetType as TargetTypeV3,
  })

  return streamV3({
    request,
    provider,
    logTag: 'record-regenerate',
    stage: 'generate',
    providerName: isMock ? 'mock' : (modelConfig?.provider ?? provider.id),
    modelId: isMock ? 'mock' : (modelConfig?.modelId ?? provider.id),
    chatRequest: {
      modelConfigId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: params.temperature,
      maxTokens: params.maxTokens,
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
        kind: 'generate',
        instruction: null,
        requestId: input.requestId ?? null,
      })
      return { recordId: record.id, iterationId: iteration.id }
    },
  })
}
