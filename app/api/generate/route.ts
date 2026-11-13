/**
 * POST /api/generate：v3 首轮生成与优化（SSE）。
 *
 * 事件序列：start、delta*、meta、usage?、done；失败时 error 后接 done(failed)。
 * 元数据由 MetaSplitter 边流边切分，分隔符与 JSON 永不进入 delta 与落库正文。
 * 记录层幂等由模块级 store 承担，迭代层由 requestId 唯一约束兜底。
 */
import { z } from 'zod'
import { appendIteration, createRecord } from '@/lib/db/records'
import { getPrisma } from '@/lib/db/prisma'
import { buildGenerateMessages } from '@/lib/engine/prompts/generate'
import { buildOptimizeMessages } from '@/lib/engine/prompts/optimize'
import {
  createStreamIdempotencyStore,
  isUniqueViolation,
  jsonError,
  streamV3,
} from '@/lib/engine/stream-v3'
import {
  DEFAULT_GENERATE_MODEL_CONFIG_ID,
  DEFAULT_OPTIMIZE_MODEL_CONFIG_ID,
  getGenerateProvider,
  getModelConfig,
  getOptimizeProvider,
} from '@/lib/llm/registry'
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

const idempotencyStore = createStreamIdempotencyStore()

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

  const { system, user } =
    mode === 'generate'
      ? buildGenerateMessages({ sourceInput: input.sourceInput, targetType })
      : buildOptimizeMessages({
          sourceInput: input.sourceInput,
          ...(input.instruction ? { instruction: input.instruction } : {}),
        })

  return streamV3({
    request,
    provider,
    logTag: 'generate',
    stage: mode,
    providerName,
    modelId,
    chatRequest: {
      modelConfigId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 8192,
      thinking: 'off',
    },
    fallbackTitle: input.sourceInput.slice(0, 24),
    updateTitle: true,
    requestId: input.requestId,
    store: idempotencyStore,
    createIteration: async () => {
      const record = await createRecord({
        mode,
        targetType,
        sourceInput: input.sourceInput,
        requestId: input.requestId ?? null,
        originTemplateId: input.originTemplateId ?? null,
      })
      try {
        const iteration = await appendIteration({
          recordId: record.id,
          seq: 1,
          kind: mode,
          instruction: input.instruction ?? null,
          requestId: input.requestId ?? null,
        })
        return { recordId: record.id, iterationId: iteration.id }
      } catch (error) {
        if (isUniqueViolation(error)) {
          // 本次多建的空记录没有迭代，清掉避免出现悬空记录
          await getPrisma()?.promptRecord.delete({ where: { id: record.id } }).catch(() => undefined)
        }
        throw error
      }
    },
  })
}
